import { realpathSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { AgentDefinition } from '@ui-ux-magec/schemas';

/** Everything a platform generator needs, independent of the runtime instance. */
export interface IntegrationInput {
  /** The design project folder the host assistant runs in (for scope "user": the platform's config home). */
  projectDir: string;
  /** "project" writes into one design project; "user" installs globally (the project is the session's cwd). */
  scope?: 'project' | 'user';
  /** Command that starts the MCP server (absolute paths). */
  mcpCommand: { command: string; args: string[]; env?: Record<string, string> };
  agents: Array<{ definition: AgentDefinition; instructions: string; allowedTools: string[] }>;
  /** name -> description for every skill, plus the per-agent index text. */
  skillIndex: (agentId: string) => string;
}

export const SERVER_NAME = 'ui-ux-magec';

export function orchestratorPlaybook(toolRef: (t: string) => string): string {
  return `## Operating loop
1. Call ${toolRef('magec_project_status')}. If there is no project, collect a name and brief from the user (ask only for what is essential) and call ${toolRef('magec_project_init')}; then ${toolRef('magec_plan_workflow')} with kind "new-project" (or "audit" with mode audit|suggest|extend for an existing Figma file, "research" for scoped research).
2. Loop: ${toolRef('magec_task_next')} → for each task, delegate to the agent named in the task (subagent "magec-<agent>"), telling it the taskId. Independent tasks with different scopes may run in parallel. Tasks marked deterministic: ${toolRef('magec_task_run_deterministic')}.
3. After each result, check ${toolRef('magec_project_status')}. Failed tasks are retried automatically up to their limit; report persistent failures honestly.
4. Tasks in waiting_for_approval need the user: present the options, wait for their answer, then call ${toolRef('magec_approval_resolve')} quoting their words. Never approve on the user's behalf.
5. User feedback (English or Arabic) goes to ${toolRef('magec_feedback_submit')}; it creates scoped tasks and never redesigns unrelated sections.
6. Before any Figma work check ${toolRef('magec_figma_status')}. If the plugin is not connected, ask the user to open the "ui-ux-magec bridge" plugin in Figma Desktop; never claim Figma changes that were not confirmed.
7. Resuming: ${toolRef('magec_project_status')} restores everything from the workspace; do not rely on chat history.

Every magec tool accepts "as_agent"; subagents pass their own id so their permissions apply.`;
}

export function projectEnv(input: IntegrationInput): Record<string, string> {
  return input.scope === 'user' ? {} : { MAGEC_PROJECT_DIR: input.projectDir };
}

/**
 * The Node binary to register in assistant configs. Prefers a PATH entry (e.g. /opt/homebrew/bin/node) that
 * resolves to the running binary over `process.execPath`, which is often a versioned path such as
 * /opt/homebrew/Cellar/node/<version>/bin/node that disappears on the next upgrade.
 */
export function stableNodePath(): string {
  const exe = process.platform === 'win32' ? 'node.exe' : 'node';
  let target: string;
  try {
    target = realpathSync(process.execPath);
  } catch {
    return process.execPath;
  }
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, exe);
    try {
      if (realpathSync(candidate) === target) return candidate;
    } catch {
      /* not here */
    }
  }
  return process.execPath;
}
