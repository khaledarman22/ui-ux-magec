import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Creates an isolated project folder and MAGEC_HOME for one test; returns a cleanup function. */
export function sandbox(): { dir: string; home: string; cleanup: () => void } {
  const base = mkdtempSync(join(tmpdir(), 'magec-test-'));
  const dir = join(base, 'project');
  const home = join(base, 'home');
  const prev = process.env.MAGEC_HOME;
  process.env.MAGEC_HOME = home;
  mkdirSync(dir, { recursive: true });
  return {
    dir,
    home,
    cleanup: () => {
      if (prev === undefined) delete process.env.MAGEC_HOME;
      else process.env.MAGEC_HOME = prev;
      rmSync(base, { recursive: true, force: true });
    },
  };
}
