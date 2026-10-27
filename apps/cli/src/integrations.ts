import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MagecRuntime } from '@ui-ux-magec/runtime';
import { applyPlanned, claudeCodeActions, codexActions, describePlanned, openCodeActions, planActions, SERVER_NAME, stableNodePath, type FileAction, type IntegrationInput, type PlannedAction } from '@ui-ux-magec/integrations';

export type Platform = 'claude' | 'codex' | 'opencode';
export const PLATFORMS: Platform[] = ['claude', 'codex', 'opencode'];

export function integrationInput(rt: MagecRuntime): IntegrationInput {
  return {
    projectDir: rt.projectDir,
    mcpCommand: { command: stableNodePath(), args: [join(rt.root, 'apps', 'runtime', 'bin', 'mcp.js')] },
    agents: rt.agents.list().map((a) => ({ definition: a.definition, instructions: a.instructions, allowedTools: rt.tools.allowedFor(a.definition.id).map((t) => t.name) })),
    skillIndex: (id) => rt.skills.indexFor(rt.agents.require(id).definition),
  };
}

export function actionsFor(platform: Platform, input: IntegrationInput): FileAction[] {
  if (platform === 'claude') return claudeCodeActions(input);
  if (platform === 'codex') return codexActions(input);
  return openCodeActions(input);
}

/** Codex fails on duplicate TOML tables, so a server defined outside our markers is a conflict. */
function codexDuplicate(planned: PlannedAction[]): PlannedAction[] {
  return planned.map((p) => {
    if (!p.action.path.endsWith('config.toml') || !existsSync(p.action.path)) return p;
    const text = readFileSync(p.action.path, 'utf8').replace(/# >>> ui-ux-magec >>>[\s\S]*?# <<< ui-ux-magec <<</, '');
    if (new RegExp(`\\[mcp_servers\\.(?:"${SERVER_NAME}"|${SERVER_NAME})\\]`).test(text)) return { ...p, status: 'conflict', reason: `config.toml already defines mcp_servers.${SERVER_NAME}` };
    return p;
  });
}

export function planIntegration(rt: MagecRuntime, platform: Platform, opts: { force?: boolean } = {}): PlannedAction[] {
  const planned = planActions(actionsFor(platform, integrationInput(rt)), opts);
  return platform === 'codex' ? codexDuplicate(planned) : planned;
}

export { applyPlanned, describePlanned };
