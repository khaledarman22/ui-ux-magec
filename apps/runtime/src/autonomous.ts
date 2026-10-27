import { buildSystemPrompt, buildTaskPrompt, type AgentExecutor } from '@ui-ux-magec/agent-core';
import type { Task } from '@ui-ux-magec/schemas';
import type { MagecRuntime } from './runtime.js';
import { DETERMINISTIC_TASKS, runDeterministicTask } from './deterministic.js';

/**
 * Autonomous mode: the orchestrator loop dispatches each ready task to its agent through an executor
 * (Claude API) with that agent's permission-filtered tools, or to runtime code for deterministic tasks.
 */
export async function runAutonomous(rt: MagecRuntime, executor: AgentExecutor, opts: { maxTasks?: number; concurrency?: number; onEvent?: (e: { type: string; task: Task }) => void; signal?: AbortSignal } = {}) {
  const p = rt.requireProject();
  return p.orchestrator.runLoop({
    ...(opts.maxTasks !== undefined ? { maxTasks: opts.maxTasks } : {}),
    ...(opts.concurrency !== undefined ? { concurrency: opts.concurrency } : {}),
    ...(opts.onEvent ? { onEvent: opts.onEvent } : {}),
    ...(opts.signal ? { signal: opts.signal } : {}),
    execute: async (task) => {
      if (DETERMINISTIC_TASKS.includes(task.type)) {
        await runDeterministicTask(rt, p, task);
        return;
      }
      if (!executor.available) {
        await p.tasks.fail(task.taskId, { message: `no model executor available for agent ${task.agent} (${executor.name})`, kind: 'external', retryable: false });
        return;
      }
      const agent = rt.agents.require(task.agent);
      const tools = rt.tools.allowedFor(task.agent).filter((t) => t.name !== 'magec_task_start');
      const result = await executor.run({
        agent: agent.definition,
        task,
        systemPrompt: buildSystemPrompt(agent, rt.skills, { platform: 'ui-ux-magec autonomous runtime' }),
        taskPrompt: `${buildTaskPrompt(task, await p.orchestrator.contextPack(task))}\n\nThe task is already started (status running). Do the work, then call magec_task_complete or magec_task_fail with taskId "${task.taskId}".`,
        tools,
        invoke: (name, input) => rt.tools.invoke(name, input, { agentId: task.agent, taskId: task.taskId }),
        ...(opts.signal ? { signal: opts.signal } : {}),
      });
      const after = await p.tasks.get(task.taskId);
      if (after.status === 'running') {
        await p.tasks.fail(task.taskId, { message: `agent stopped (${result.status}${result.error ? `: ${result.error}` : ''}) without completing the task`, kind: result.status === 'refused' ? 'external' : 'technical', retryable: result.status !== 'refused' });
      }
    },
  });
}
