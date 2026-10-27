import { homedir } from 'node:os';
import { join } from 'node:path';
import { MANAGED_MARKER, type FileAction } from './plan.js';
import { SERVER_NAME, orchestratorPlaybook, type IntegrationInput } from './model.js';

const toolRef = (t: string) => `\`${t}\``;

function tomlString(s: string): string {
  return JSON.stringify(s);
}

export function codexConfigBlock(input: IntegrationInput): string {
  // User-level config is shared by every project, so the project is the directory Codex is started in.
  const env = { MAGEC_PLATFORM: 'codex', ...(input.mcpCommand.env ?? {}) };
  return [
    `# ${MANAGED_MARKER}`,
    `[mcp_servers.${tomlString(SERVER_NAME)}]`,
    `command = ${tomlString(input.mcpCommand.command)}`,
    `args = [${input.mcpCommand.args.map(tomlString).join(', ')}]`,
    `env = { ${Object.entries(env).map(([k, v]) => `${k} = ${tomlString(v)}`).join(', ')} }`,
    `startup_timeout_sec = 20`,
    `tool_timeout_sec = 300`,
  ].join('\n');
}

/**
 * OpenAI Codex: no native subagents, so AGENTS.md teaches the main agent to act as the orchestrator and to
 * switch roles by loading each specialist's brief (magec_agent_brief) and passing as_agent. The MCP server
 * goes into ~/.codex/config.toml (user-level; Codex has no project-level MCP config we rely on).
 */
export function codexActions(input: IntegrationInput, opts: { codexHome?: string } = {}): FileAction[] {
  const codexHome = opts.codexHome ?? process.env.CODEX_HOME ?? join(homedir(), '.codex');
  const roster = input.agents.map((a) => `- \`${a.definition.id}\` — ${a.definition.description} (tasks: ${a.definition.taskTypes.join(', ')})`).join('\n');
  return [
    {
      kind: 'text-block',
      // User scope uses Codex's global instructions file.
      path: input.scope === 'user' ? join(codexHome, 'AGENTS.md') : join(input.projectDir, 'AGENTS.md'),
      block: `## ui-ux-magec (${MANAGED_MARKER})

When the current folder is a ui-ux-magec design project (it has \`.ui-ux-magec/\`) or the user asks for UI/UX design work through ui-ux-magec, use the \`${SERVER_NAME}\` MCP tools for all project work; the workspace in \`.ui-ux-magec/\` is the source of truth.

You act as the **master-orchestrator**. Codex has no subagents, so to run a specialist task:
1. Call \`magec_agent_brief\` with that agent id and the taskId, and follow that brief exactly while doing the task.
2. Pass \`"as_agent": "<agent-id>"\` in every magec call made for that task (permissions are enforced per agent).
3. Return to the orchestrator role (no \`as_agent\`) when the task is completed or failed.

Agents:
${roster}

${orchestratorPlaybook(toolRef)}`,
    },
    {
      kind: 'text-block',
      path: join(codexHome, 'config.toml'),
      block: codexConfigBlock(input),
      start: '# >>> ui-ux-magec >>>',
      end: '# <<< ui-ux-magec <<<',
    },
  ];
}
