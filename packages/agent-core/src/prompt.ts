import type { Task } from '@ui-ux-magec/schemas';
import type { SkillRegistry } from '@ui-ux-magec/skill-registry';
import type { RegisteredAgent } from './registry.js';

/**
 * System prompt for an agent: its own instructions plus a compact skill index. Skill bodies are not inlined;
 * the agent loads what it needs with `magec_skill_load`, keeping context small.
 */
export function buildSystemPrompt(agent: RegisteredAgent, skills: SkillRegistry, opts: { platform?: string } = {}): string {
  const d = agent.definition;
  return [
    `You are the "${d.id}" agent of ui-ux-magec, a local-first multi-agent UI/UX design system.`,
    `Role: ${d.description}`,
    '',
    agent.instructions.trim(),
    '',
    '## Skills available to you',
    'Load a skill with magec_skill_load before doing the work it covers.',
    skills.indexFor(d),
    '',
    '## Ground rules',
    '- The project workspace is the source of truth. Read context with magec_project_context; never assume earlier chat details.',
    '- Never fabricate research, references, Figma results or QA outcomes. Report what actually happened, including failures.',
    '- Finish every task with magec_task_complete (validated output) or magec_task_fail (with an honest error).',
    `- Permissions: ${d.permissions.join(', ')}. Tools outside them are refused.`,
    opts.platform ? `- Host platform: ${opts.platform}.` : '',
  ].filter((l) => l !== '').join('\n');
}

export function buildTaskPrompt(task: Task, contextPack: string): string {
  return [
    `# Task ${task.taskId}: ${task.title}`,
    `Type: ${task.type} · attempt ${task.attempt}/${task.maxAttempts}${task.scope ? ` · scope ${task.scope}` : ''}`,
    task.description ? `\n${task.description}` : '',
    Object.keys(task.params).length ? `\nParameters:\n\`\`\`json\n${JSON.stringify(task.params, null, 2)}\n\`\`\`` : '',
    task.inputRefs.length ? `\nInputs: ${task.inputRefs.join(', ')}` : '',
    task.errors.length ? `\nPrevious errors:\n${task.errors.map((e) => `- [attempt ${e.attempt}] ${e.message}`).join('\n')}` : '',
    '\n## Project context\n',
    contextPack,
  ].join('\n');
}
