import { createInterface } from 'node:readline/promises';

export interface IO {
  out(line?: string): void;
  err(line: string): void;
  /** Asks a question; returns null when there is no interactive terminal. */
  ask(question: string): Promise<string | null>;
  interactive: boolean;
}

export const processIO: IO = {
  out: (l = '') => process.stdout.write(l + '\n'),
  err: (l) => process.stderr.write(l + '\n'),
  interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
  async ask(q) {
    if (!this.interactive) return null;
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      return (await rl.question(q)).trim();
    } finally {
      rl.close();
    }
  },
};

export async function confirm(io: IO, question: string, opts: { yes?: boolean } = {}): Promise<boolean> {
  if (opts.yes) return true;
  const a = await io.ask(`${question} [y/N] `);
  if (a === null) return false;
  return /^(y|yes|نعم)$/i.test(a);
}

export class CliError extends Error {
  constructor(message: string, public readonly exitCode = 1) {
    super(message);
  }
}
