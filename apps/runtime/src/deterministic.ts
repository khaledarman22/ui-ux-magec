import { TASK_CONTRACTS, nowIso, type Task, type TaskType } from '@ui-ux-magec/schemas';
import { FigmaBridgeError } from '@ui-ux-magec/figma-bridge';
import type { MagecRuntime, ProjectServices } from './runtime.js';

/** Task types executed by runtime code; no model is involved. */
export const DETERMINISTIC_TASKS: TaskType[] = ['figma-snapshot', 'figma-reconcile', 'checkpoint'];

export async function snapshotFigma(rt: MagecRuntime, p: ProjectServices): Promise<Record<string, unknown>> {
  await p.figma.ensureFile();
  const document = await rt.transport.request({ op: 'read_document', includeFrames: true });
  const components = await rt.transport.request({ op: 'read_components' });
  const styles = await rt.transport.request({ op: 'read_styles' });
  const variables = await rt.transport.request({ op: 'read_variables' });
  const snapshot = { takenAt: nowIso(), source: 'plugin', document, components, styles, variables };
  await p.cache.set('figma-metadata', 'snapshot', snapshot, { source: 'figma-plugin', dependencies: [`figma-file:${p.ws.getProject().figma.fileKey}`] });
  return snapshot;
}

export async function runDeterministicTask(rt: MagecRuntime, p: ProjectServices, task: Task): Promise<{ status: string; artifact?: string; error?: string }> {
  try {
    let output: unknown;
    if (task.type === 'figma-snapshot') output = await snapshotFigma(rt, p);
    else if (task.type === 'figma-reconcile') output = await p.figma.reconcile();
    else if (task.type === 'checkpoint') {
      const snap = (await p.tasks.list()).map((t) => ({ taskId: t.taskId, status: t.status, attempt: t.attempt }));
      output = await p.ws.createCheckpoint(String(task.params.stage ?? 'manual'), task.title, snap);
    } else {
      throw new Error(`${task.type} is not a deterministic task`);
    }
    const path = TASK_CONTRACTS[task.type].artifactPath(task);
    if (task.type !== 'figma-reconcile') await p.ws.writeArtifact(path, output, { kind: 'other', producedBy: 'runtime', taskId: task.taskId });
    const done = await p.tasks.complete(task.taskId, { outputRefs: [path], validation: { ok: true, errors: [], warnings: [], checkedAt: nowIso() } });
    await p.orchestrator.onTaskCompleted(done);
    return { status: 'completed', artifact: path };
  } catch (err) {
    const e = err as Error;
    const external = err instanceof FigmaBridgeError;
    const after = await p.tasks.fail(task.taskId, { message: e.message, kind: external ? 'external' : 'technical', retryable: !(external && (err as FigmaBridgeError).code === 'conflict') });
    return { status: after.status, error: e.message };
  }
}
