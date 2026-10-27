import { existsSync } from 'node:fs';
import type { AssetSourcingReport, FigmaWriteReport, QAReport, ResearchReport, Task, VisualAnalysisReport, ConceptSet } from '@ui-ux-magec/schemas';
import { AssetStore } from './assets.js';
import type { ProjectServices } from './runtime.js';

/**
 * Cross-checks a task's claimed output against workspace facts, so an agent cannot report work that did not
 * happen: Figma nodes must be in the confirmed mapping table, references must exist, previews must exist.
 */
export async function verifyClaims(p: ProjectServices, task: Task, output: unknown): Promise<{ errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];
  switch (task.type) {
    case 'figma-foundations':
    case 'figma-page-design':
    case 'figma-fix': {
      const r = output as FigmaWriteReport;
      const mappings = new Map((await p.figma.mappings()).map((m) => [m.logicalId, m]));
      const journal = new Map((await p.figma.journal()).map((j) => [j.operationId, j]));
      for (const op of r.operationIds) {
        const j = journal.get(op);
        if (!j) errors.push(`operation ${op} is not in the Figma operation journal`);
        else if (j.status !== 'confirmed' && j.status !== 'recovered') errors.push(`operation ${op} is ${j.status}, not confirmed`);
      }
      for (const n of r.nodes) {
        const m = mappings.get(n.logicalId);
        if (!m) errors.push(`node ${n.logicalId} was never written through the bridge`);
        else if (m.nodeId !== n.nodeId) errors.push(`node ${n.logicalId} maps to ${m.nodeId}, not ${n.nodeId}`);
        else if (m.status !== 'active') warnings.push(`node ${n.logicalId} is ${m.status}`);
      }
      if (!r.nodes.length && !r.operationIds.length && task.type !== 'figma-fix') errors.push('a Figma design task must report the nodes it created or updated');
      for (const prev of r.previews) if (!existsSync(p.ws.resolve(prev))) errors.push(`preview ${prev} does not exist`);
      break;
    }
    case 'asset-sourcing': {
      const r = output as AssetSourcingReport;
      const library = new Map((await new AssetStore(p.ws).list()).map((a) => [a.assetId, a]));
      for (const item of [...r.images, ...r.icons]) {
        const a = library.get(item.assetId);
        if (!a) errors.push(`asset ${item.assetId} (${item.slot}) is not in the asset library; add it with the asset tools`);
        else if (a.path !== item.path) errors.push(`asset ${item.assetId} is stored at ${a.path}, not ${item.path}`);
        else if (a.kind === 'reference') errors.push(`${item.slot}: reference images are inspiration only and cannot be design assets`);
      }
      if (r.strategy.imageGeneration === 'used' && !r.images.some((i) => library.get(i.assetId)?.origin === 'generated')) errors.push('strategy says images were generated, but no reported image is a generated asset');
      break;
    }
    case 'research': {
      const r = output as ResearchReport;
      const refs = new Map((await p.references.list({ includeRejected: true })).map((x) => [x.reference_id, x]));
      for (const id of r.referenceIds) if (!refs.has(id)) errors.push(`reference ${id} does not exist (submit candidates with magec_research_submit_candidates first)`);
      const unverified = r.referenceIds.filter((id) => refs.get(id) && !refs.get(id)!.verified);
      if (unverified.length) warnings.push(`${unverified.length} reference(s) are unverified and must not be presented as verified`);
      if (r.referenceIds.length && new Set(r.referenceIds.map((id) => refs.get(id)?.source)).size < 2) warnings.push('all references come from a single source');
      break;
    }
    case 'visual-analysis': {
      const r = output as VisualAnalysisReport;
      for (const id of r.analysisIds) if (!(await p.references.getAnalysis(id))) errors.push(`analysis ${id} was not saved (use magec_reference_save_analysis)`);
      break;
    }
    case 'concept-generation': {
      const r = output as ConceptSet;
      if (!r.concepts.some((c) => c.conceptId === r.recommendedConceptId)) errors.push('recommendedConceptId is not one of the concepts');
      const refs = new Set((await p.references.list({ includeRejected: true })).map((x) => x.reference_id));
      for (const c of r.concepts) for (const id of c.referenceIds) if (!refs.has(id)) errors.push(`concept ${c.conceptId} cites unknown reference ${id}`);
      if (task.params.scope === 'project' && r.concepts.length < 2) warnings.push('major projects should compare at least two concepts');
      break;
    }
    case 'design-qa': {
      const r = output as QAReport;
      if (r.visualReview.performed && !r.visualReview.previews.length) errors.push('visual review marked performed but no previews were listed');
      for (const prev of r.visualReview.previews) if (!existsSync(p.ws.resolve(prev))) errors.push(`preview ${prev} does not exist`);
      if (!r.structuralChecks.length) errors.push('QA must include structural checks (run magec_qa_run)');
      const blocking = r.issues.filter((i) => i.severity === 'critical' || i.severity === 'major');
      if (r.passed && blocking.length) errors.push(`report says passed but lists ${blocking.length} critical/major issue(s)`);
      if (!r.visualReview.performed) warnings.push('visual review not performed; recorded as a limitation');
      break;
    }
    default:
      break;
  }
  return { errors, warnings };
}
