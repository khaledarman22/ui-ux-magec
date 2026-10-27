import { join } from 'node:path';
import { MANAGED_MARKER, type FileAction } from './plan.js';
import { SERVER_NAME, orchestratorPlaybook, projectEnv, type IntegrationInput } from './model.js';

const toolRef = (t: string) => `mcp__${SERVER_NAME}__${t}`;

function yamlList(items: string[]): string {
  return items.join(', ');
}

/**
 * Claude Code: project-scoped MCP server in .mcp.json, one subagent per specialist in .claude/agents with a
 * restricted tool list, and an entry skill that makes the main conversation act as the master orchestrator.
 */
export function claudeCodeActions(input: IntegrationInput): FileAction[] {
  // User scope registers the server with `claude mcp add --scope user` instead of a project .mcp.json.
  const actions: FileAction[] = input.scope === 'user' ? [] : [
    { kind: 'json-merge', path: join(input.projectDir, '.mcp.json'), pointer: ['mcpServers'], key: SERVER_NAME, value: { type: 'stdio', command: input.mcpCommand.command, args: input.mcpCommand.args, env: { MAGEC_PLATFORM: 'claude-code', ...projectEnv(input), ...(input.mcpCommand.env ?? {}) } } },
  ];
  for (const a of input.agents) {
    const d = a.definition;
    if (d.kind === 'orchestrator') continue;
    const tools = [...d.hostTools, ...a.allowedTools.map(toolRef)];
    actions.push({
      kind: 'managed-file',
      path: join(input.projectDir, '.claude', 'agents', `magec-${d.id}.md`),
      content: `---
name: magec-${d.id}
description: ${d.description} Use for ui-ux-magec tasks of type ${d.taskTypes.join(', ')}.
tools: ${yamlList(tools)}
---
<!-- ${MANAGED_MARKER}; regenerate with \`ui-ux-magec install-integrations\` -->

You are the **${d.name}** agent of ui-ux-magec. Pass \`"as_agent": "${d.id}"\` in EVERY magec tool call.
You will be given a taskId: call ${toolRef('magec_task_start')} first, follow the brief, and finish with ${toolRef('magec_task_complete')} or ${toolRef('magec_task_fail')}.

${a.instructions.trim()}

## Skills
Load a skill with ${toolRef('magec_skill_load')} before doing the work it covers.
${input.skillIndex(d.id)}
`,
    });
  }
  const orch = input.agents.find((a) => a.definition.kind === 'orchestrator');
  if (orch) {
    actions.push({
      kind: 'managed-file',
      path: join(input.projectDir, '.claude', 'skills', 'ui-ux-magec', 'SKILL.md'),
      content: `---
name: ui-ux-magec
description: Run the ui-ux-magec multi-agent UI/UX workflow (product analysis, real reference research, concepts, design system, native Figma design, QA, feedback in English/Arabic). Use when the user asks to design, research, audit, review, or continue a ui-ux-magec project.
---
<!-- ${MANAGED_MARKER} -->

You are the **Master Orchestrator** of ui-ux-magec in this conversation. Specialists run as subagents named \`magec-<agent-id>\`.

${orchestratorPlaybook(toolRef)}

${orch.instructions.trim()}
`,
    });
  }
  return actions;
}
