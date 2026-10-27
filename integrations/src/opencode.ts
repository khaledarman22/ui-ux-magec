import { join } from 'node:path';
import { MANAGED_MARKER, type FileAction } from './plan.js';
import { SERVER_NAME, orchestratorPlaybook, projectEnv, type IntegrationInput } from './model.js';

/** OpenCode exposes MCP tools as `<server>_<tool>`. */
const toolRef = (t: string) => `${SERVER_NAME}_${t}`;

/**
 * OpenCode: MCP server in opencode.json, a primary "magec" agent acting as orchestrator and one subagent per
 * specialist in .opencode/agent with all ui-ux-magec tools disabled except the ones its permissions allow.
 */
export function openCodeActions(input: IntegrationInput): FileAction[] {
  const actions: FileAction[] = [
    { kind: 'json-merge', path: join(input.projectDir, 'opencode.json'), pointer: ['mcp'], key: SERVER_NAME, value: { type: 'local', command: [input.mcpCommand.command, ...input.mcpCommand.args], enabled: true, environment: { MAGEC_PLATFORM: 'opencode', ...projectEnv(input), ...(input.mcpCommand.env ?? {}) } } },
  ];
  for (const a of input.agents) {
    const d = a.definition;
    const isOrch = d.kind === 'orchestrator';
    const toolLines = [`  "${SERVER_NAME}_*": false`, ...a.allowedTools.map((t) => `  ${toolRef(t)}: true`)];
    if (!isOrch) toolLines.push('  write: false', '  edit: false', '  bash: false');
    actions.push({
      kind: 'managed-file',
      // Global config keeps agents in <config>/agent, projects in .opencode/agent.
      path: input.scope === 'user' ? join(input.projectDir, 'agent', `magec-${d.id}.md`) : join(input.projectDir, '.opencode', 'agent', `magec-${d.id}.md`),
      content: `---
description: ${d.description}
mode: ${isOrch ? 'primary' : 'subagent'}
tools:
${toolLines.join('\n')}
---
<!-- ${MANAGED_MARKER} -->

You are the **${d.name}** agent of ui-ux-magec. Pass \`"as_agent": "${d.id}"\` in every ${SERVER_NAME} tool call.
${isOrch ? `Specialists are subagents named magec-<agent-id>; delegate each task to the agent it is assigned to.\n\n${orchestratorPlaybook(toolRef)}` : `You receive a taskId: call ${toolRef('magec_task_start')} first and finish with ${toolRef('magec_task_complete')} or ${toolRef('magec_task_fail')}.`}

${a.instructions.trim()}

## Skills
${input.skillIndex(d.id)}
`,
    });
  }
  return actions;
}
