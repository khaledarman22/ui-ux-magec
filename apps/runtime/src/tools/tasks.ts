import { buildSystemPrompt } from '@ui-ux-magec/agent-core';
import { FeedbackInterpretationSchema, NewTaskSchema, TASK_CONTRACTS, TaskStatusSchema, nowIso, z, type Task } from '@ui-ux-magec/schemas';
import { APPROVAL_TYPES } from '@ui-ux-magec/orchestration';
import type { MagecRuntime } from '../runtime.js';
import { verifyClaims } from '../verify.js';
import { DETERMINISTIC_TASKS, runDeterministicTask } from '../deterministic.js';
import { defineTool } from '@ui-ux-magec/agent-core';

function assertOwner(rt: MagecRuntime, task: Task, agentId: string): void {
  if (task.agent === agentId) return;
  if (rt.agents.permissionsOf(agentId).has('tasks.manage')) return;
  throw new Error(`task ${task.taskId} is assigned to ${task.agent}, not ${agentId}`);
}

export function taskTools(rt: MagecRuntime) {
  return [
    defineTool({
      name: 'magec_plan_workflow',
      description: 'Create a task graph: "new-project" (full research→design pipeline), "research" (scoped research, e.g. hero sections), "audit" (existing Figma: mode audit|suggest|extend), "review" (QA of designed pages). Planning is idempotent.',
      permissions: ['tasks.manage'],
      input: z.object({
        kind: z.enum(['new-project', 'research', 'audit', 'review']),
        request: z.string().default(''),
        category: z.string().optional(),
        mode: z.enum(['audit', 'suggest', 'extend']).default('audit'),
        pages: z.array(z.string()).optional(),
      }),
      handler: async (i) => {
        const { orchestrator } = rt.requireProject();
        const created = i.kind === 'new-project' ? await orchestrator.planNewProject()
          : i.kind === 'research' ? await orchestrator.planResearch(i.request, i.category)
          : i.kind === 'audit' ? await orchestrator.planAudit(i.mode, i.request)
          : await orchestrator.planReview(i.pages);
        return { created: created.map((t) => ({ taskId: t.taskId, agent: t.agent, type: t.type, status: t.status, title: t.title })) };
      },
    }),
    defineTool({
      name: 'magec_task_list',
      description: 'List tasks, optionally filtered by status or agent.',
      permissions: ['tasks.read'],
      input: z.object({ status: z.array(TaskStatusSchema).optional(), agent: z.string().optional(), limit: z.number().int().min(1).max(500).default(100) }),
      handler: async (i) => {
        const list = await rt.requireProject().tasks.list({ ...(i.status ? { status: i.status } : {}), ...(i.agent ? { agent: i.agent } : {}) });
        return { tasks: list.slice(0, i.limit).map((t) => ({ taskId: t.taskId, agent: t.agent, type: t.type, status: t.status, title: t.title, attempt: t.attempt, dependencies: t.dependencies, scope: t.scope })) };
      },
    }),
    defineTool({
      name: 'magec_task_get',
      description: 'Full details of one task, including params, errors and output refs.',
      permissions: ['tasks.read'],
      input: z.object({ taskId: z.string() }),
      handler: async (i) => rt.requireProject().tasks.get(i.taskId),
    }),
    defineTool({
      name: 'magec_task_next',
      description: 'Ready tasks to dispatch next (orchestrator) or for one agent. Approval tasks are never returned; they wait for the user.',
      permissions: ['tasks.read'],
      input: z.object({ agent: z.string().optional(), limit: z.number().int().min(1).max(20).default(5) }),
      handler: async (i) => {
        const { tasks, orchestrator } = rt.requireProject();
        await orchestrator.promoteApprovals();
        const batch = (await tasks.schedule(20)).filter((t) => !(APPROVAL_TYPES as readonly string[]).includes(t.type) && (!i.agent || t.agent === i.agent));
        return {
          tasks: batch.slice(0, i.limit).map((t) => ({ taskId: t.taskId, agent: t.agent, type: t.type, title: t.title, scope: t.scope, deterministic: DETERMINISTIC_TASKS.includes(t.type) })),
          hint: 'Dispatch each task to its agent (subagent) and have it call magec_task_start with the taskId. Tasks marked deterministic can be run with magec_task_run_deterministic.',
        };
      },
    }),
    defineTool({
      name: 'magec_task_start',
      description: 'Claim a ready task (moves it to running) and receive its brief: instructions, parameters, required output contract and project context.',
      permissions: ['tasks.self'],
      input: z.object({ taskId: z.string() }),
      handler: async (i, ctx) => {
        const { tasks, orchestrator } = rt.requireProject();
        const task = await tasks.get(i.taskId);
        assertOwner(rt, task, ctx.agentId);
        const claimed = await tasks.claim(task.taskId, ctx.agentId);
        const contract = TASK_CONTRACTS[claimed.type];
        return {
          task: claimed,
          outputContract: { schema: contract.schemaName, artifactPath: contract.artifactPath(claimed) },
          context: await orchestrator.contextPack(claimed),
          finish: 'Call magec_task_complete with { taskId, output } matching the contract, or magec_task_fail with an honest error.',
        };
      },
    }),
    defineTool({
      name: 'magec_task_complete',
      description: 'Complete a running task with its structured output. The output is schema-validated and cross-checked against workspace facts (Figma journal, references, previews) before being accepted.',
      permissions: ['tasks.self'],
      input: z.object({ taskId: z.string(), output: z.unknown(), notes: z.string().optional() }),
      handler: async (i, ctx) => {
        const p = rt.requireProject();
        const task = await p.tasks.get(i.taskId);
        assertOwner(rt, task, ctx.agentId);
        if (task.status !== 'running') throw new Error(`task ${task.taskId} is ${task.status}; call magec_task_start first`);
        const contract = TASK_CONTRACTS[task.type];
        let output: unknown = i.output;
        if (contract.schema) {
          const parsed = contract.schema.safeParse(i.output);
          if (!parsed.success) {
            return { accepted: false, errors: parsed.error.issues.slice(0, 30).map((x) => `${x.path.join('.') || '(root)'}: ${x.message}`), hint: `output must match ${contract.schemaName}` };
          }
          output = parsed.data;
        }
        const claims = await verifyClaims(p, task, output);
        if (claims.errors.length) return { accepted: false, errors: claims.errors, hint: 'fix the output so it only reports work that actually happened' };
        const path = contract.artifactPath(task);
        await p.ws.writeArtifact(path, output ?? {}, { kind: contract.kind, producedBy: ctx.agentId, taskId: task.taskId });
        const followUps = await p.orchestrator.beforeComplete(task);
        const done = await p.tasks.complete(task.taskId, { outputRefs: [path], validation: { ok: true, errors: [], warnings: claims.warnings, checkedAt: nowIso() } });
        if (i.notes) await p.tasks.sendMessage({ from: ctx.agentId, to: 'master-orchestrator', taskId: task.taskId, kind: 'result', body: i.notes, artifactRefs: [path] });
        const created = [...followUps, ...(await p.orchestrator.onTaskCompleted(done))];
        return { accepted: true, artifact: path, warnings: claims.warnings, newTasks: created.map((t) => ({ taskId: t.taskId, agent: t.agent, title: t.title })) };
      },
    }),
    defineTool({
      name: 'magec_task_fail',
      description: 'Report that a running task failed. Technical, retryable failures are retried up to the attempt limit; a creative rejection is NOT a failure (use feedback instead).',
      permissions: ['tasks.self'],
      input: z.object({ taskId: z.string(), message: z.string().min(3), kind: z.enum(['technical', 'validation', 'permission', 'conflict', 'external', 'unknown']).default('technical'), retryable: z.boolean().default(true) }),
      handler: async (i, ctx) => {
        const { tasks } = rt.requireProject();
        const task = await tasks.get(i.taskId);
        assertOwner(rt, task, ctx.agentId);
        const after = await tasks.fail(task.taskId, { message: i.message, kind: i.kind, retryable: i.retryable });
        return { status: after.status, attempt: after.attempt, maxAttempts: after.maxAttempts };
      },
    }),
    defineTool({
      name: 'magec_task_create',
      description: 'Create ad-hoc tasks (orchestrator only). Dependencies may reference task ids or idempotency keys.',
      permissions: ['tasks.manage'],
      input: z.object({ tasks: z.array(NewTaskSchema).min(1).max(50) }),
      handler: async (i) => {
        for (const t of i.tasks) if (!rt.agents.get(t.agent)) throw new Error(`unknown agent ${t.agent}`);
        const created = await rt.requireProject().tasks.create(i.tasks);
        return { created: created.map((t) => ({ taskId: t.taskId, agent: t.agent, status: t.status, title: t.title })) };
      },
    }),
    defineTool({
      name: 'magec_task_run_deterministic',
      description: `Run a task that is executed by runtime code rather than an LLM (${DETERMINISTIC_TASKS.join(', ')}).`,
      permissions: ['tasks.manage'],
      input: z.object({ taskId: z.string() }),
      handler: async (i, ctx) => {
        const p = rt.requireProject();
        const task = await p.tasks.claim(i.taskId, ctx.agentId);
        return runDeterministicTask(rt, p, task);
      },
    }),
    defineTool({
      name: 'magec_feedback_submit',
      description: 'Translate user feedback into scoped tasks (refine, redesign a section, new concept, remove with approval, review...). Pass `interpretation` to override the rule-based parser. Unrelated sections are never redesigned.',
      permissions: ['tasks.manage'],
      input: z.object({ text: z.string().min(2), interpretation: FeedbackInterpretationSchema.optional(), persistence: z.enum(['project', 'global']).default('project') }),
      handler: async (i) => {
        const r = await rt.requireProject().orchestrator.processFeedback(i.text, { ...(i.interpretation ? { interpretation: i.interpretation } : {}), persistence: i.persistence });
        if (i.persistence === 'global') await rt.knowledge.setPreference(`feedback:${Date.now()}`, i.text, 'saved as a reusable preference at the user\'s request');
        return { interpretation: r.interpretation, clarification: r.clarification ?? null, created: r.tasks.map((t) => ({ taskId: t.taskId, agent: t.agent, title: t.title, status: t.status })), superseded: r.superseded.map((t) => t.taskId) };
      },
    }),
    defineTool({
      name: 'magec_approval_request',
      description: 'Ask the user to approve something (destructive change, concept choice, overwriting edited Figma nodes). Creates an approval task that waits for the user.',
      permissions: ['approvals.request'],
      input: z.object({ title: z.string(), subject: z.string(), description: z.string().default(''), scope: z.string().default('project'), destructive: z.boolean().default(false) }),
      handler: async (i, ctx) => {
        const { tasks, orchestrator } = rt.requireProject();
        const [t] = await tasks.create([{ idempotencyKey: `approval:${i.subject}:${Date.now()}`, agent: 'master-orchestrator', type: 'approval', title: i.title, description: `${i.description}\n(requested by ${ctx.agentId})`, params: { subject: i.subject, scope: i.scope, destructive: i.destructive, requestedBy: ctx.agentId }, priority: 95 }]);
        await orchestrator.promoteApprovals();
        return { approvalTaskId: t!.taskId, message: 'Ask the user; record their answer with magec_approval_resolve (or they can run `ui-ux-magec approve`).' };
      },
    }),
    defineTool({
      name: 'magec_approval_resolve',
      description: 'Record the USER\'s answer to an approval task. Only call this after the user explicitly answered; quote their words in userConfirmation.',
      permissions: ['tasks.manage'],
      input: z.object({ taskId: z.string(), approved: z.boolean(), choice: z.string().optional(), userConfirmation: z.string().min(2) }),
      handler: async (i) => {
        const t = await rt.requireProject().orchestrator.approve(i.taskId, { approved: i.approved, note: `user: "${i.userConfirmation}"`, ...(i.choice ? { choice: i.choice } : {}) });
        return { taskId: t.taskId, status: t.status };
      },
    }),
    defineTool({
      name: 'magec_message_send',
      description: 'Send a structured message to another agent (handoff, question, revision request) attached to a task.',
      permissions: ['tasks.self'],
      input: z.object({ to: z.string(), kind: z.enum(['handoff', 'question', 'answer', 'result', 'revision-request', 'note']), body: z.string().min(1), taskId: z.string().optional(), artifactRefs: z.array(z.string()).default([]) }),
      handler: async (i, ctx) => {
        if (!rt.agents.get(i.to)) throw new Error(`unknown agent ${i.to}`);
        return rt.requireProject().tasks.sendMessage({ from: ctx.agentId, to: i.to, kind: i.kind, body: i.body, artifactRefs: i.artifactRefs, ...(i.taskId ? { taskId: i.taskId } : {}) });
      },
    }),
    defineTool({
      name: 'magec_agent_list',
      description: 'List agents with their roles, task types, skills and permissions.',
      permissions: ['tasks.read'],
      input: z.object({}),
      handler: async () => ({ agents: rt.agents.list().map((a) => ({ id: a.definition.id, kind: a.definition.kind, description: a.definition.description, taskTypes: a.definition.taskTypes, skills: a.definition.skills, permissions: a.definition.permissions })) }),
    }),
    defineTool({
      name: 'magec_agent_brief',
      description: 'Full operating brief for an agent (instructions + skill index), plus task context when taskId is given. Use it to brief a subagent, or to switch roles on platforms without subagents.',
      permissions: ['tasks.read'],
      input: z.object({ agentId: z.string(), taskId: z.string().optional() }),
      handler: async (i) => {
        const agent = rt.agents.require(i.agentId);
        const brief = buildSystemPrompt(agent, rt.skills, { ...(rt.opts.platform ? { platform: rt.opts.platform } : {}) });
        const p = rt.hasProject ? rt.requireProject() : null;
        const context = p && i.taskId ? await p.orchestrator.contextPack(await p.tasks.get(i.taskId)) : null;
        return { agentId: i.agentId, brief, context, allowedTools: rt.tools.allowedFor(i.agentId).map((t) => t.name) };
      },
    }),
    defineTool({
      name: 'magec_skill_list',
      description: 'Discover skills (metadata only). Filter by agent to see the shared skills plus that agent\'s specialized skills.',
      permissions: [],
      input: z.object({ agent: z.string().optional(), category: z.enum(['shared', 'specialized']).optional() }),
      handler: async (i) => ({ skills: rt.skills.list({ ...(i.agent ? { agent: i.agent } : {}), ...(i.category ? { category: i.category } : {}) }).map((s) => ({ name: s.name, category: s.category, description: s.description, agents: s.agents, resources: s.resources })) }),
    }),
    defineTool({
      name: 'magec_skill_load',
      description: 'Load a skill\'s instructions on demand (or one of its bundled resources). Loading a skill grants no tool permissions.',
      permissions: [],
      input: z.object({ name: z.string(), resource: z.string().optional() }),
      handler: async (i, ctx) => {
        const meta = rt.skills.get(i.name);
        if (!meta) throw new Error(`unknown skill ${i.name}`);
        if (meta.category === 'specialized' && !meta.agents.includes(ctx.agentId) && !rt.agents.permissionsOf(ctx.agentId).has('tasks.manage')) {
          throw new Error(`skill ${i.name} is specialized for ${meta.agents.join(', ')}`);
        }
        if (i.resource) return { name: i.name, resource: i.resource, content: rt.skills.loadResource(i.name, i.resource) };
        const s = rt.skills.load(i.name);
        return { name: s.meta.name, category: s.meta.category, tools: s.meta.tools, related: s.meta.related, resources: s.meta.resources, instructions: s.body };
      },
    }),
  ];
}
