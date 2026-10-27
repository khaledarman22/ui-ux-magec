import { randomBytes } from 'node:crypto';

/** Time-sortable, collision-resistant identifier: `<prefix>_<base36 time><random>`. */
export function newId(prefix: string): string {
  const time = Date.now().toString(36).padStart(9, '0');
  const rand = randomBytes(6).toString('hex');
  return `${prefix}_${time}${rand}`;
}

export const ID_PREFIX = {
  project: 'prj',
  task: 'tsk',
  decision: 'dec',
  assumption: 'asm',
  feedback: 'fbk',
  checkpoint: 'chk',
  reference: 'ref',
  analysis: 'ana',
  operation: 'op',
  message: 'msg',
  concept: 'cpt',
  issue: 'iss',
  asset: 'ast',
} as const;

export function nowIso(): string {
  return new Date().toISOString();
}

/** Lowercase, dash-separated, ascii-only slug. Arabic-only names fall back to a hash-free "project". */
export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || 'project';
}
