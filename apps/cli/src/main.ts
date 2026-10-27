import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { COMMANDS, type Flags } from './commands.js';
import { CliError, processIO, type IO } from './io.js';

const BOOLEAN_FLAGS = ['autonomous', 'yes', 'dry-run', 'force', 'reject', 'global', 'json', 'validate', 'reveal', 'reconcile', 'include-assets', 'verbose', 'help'];
const STRING_FLAGS = ['dir', 'brief', 'brief-file', 'lang', 'industry', 'market', 'figma', 'concept-selection', 'breakpoints', 'themes', 'max-tasks', 'category', 'mode', 'pages', 'choice', 'note', 'reason', 'confirm-name', 'status', 'agent', 'platform'];

function help(io: IO): void {
  io.out('ui-ux-magec — local-first multi-agent UI/UX design system\n');
  io.out('Usage: ui-ux-magec <command> [options]   (global: --dir <project folder>, --verbose)\n');
  for (const [name, c] of Object.entries(COMMANDS)) io.out(`  ${name.padEnd(22)} ${c.summary}`);
  io.out('\nRun `ui-ux-magec <command> --help` for options.');
}

export async function main(argv: string[], io: IO = processIO): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    help(io);
    return 0;
  }
  const cmd = COMMANDS[command];
  if (!cmd) {
    io.err(`unknown command "${command}"`);
    help(io);
    return 2;
  }
  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      allowPositionals: true,
      strict: true,
      options: Object.fromEntries([...BOOLEAN_FLAGS.map((f) => [f, { type: 'boolean' as const }]), ...STRING_FLAGS.map((f) => [f, { type: 'string' as const }])]),
    });
  } catch (err) {
    io.err((err as Error).message);
    io.err(`usage: ui-ux-magec ${cmd.usage}`);
    return 2;
  }
  const flags = parsed.values as Flags;
  if (flags.help) {
    io.out(`usage: ui-ux-magec ${cmd.usage}\n\n${cmd.summary}`);
    return 0;
  }
  try {
    await cmd.run({ io, dir: resolve(typeof flags.dir === 'string' ? flags.dir : process.cwd()), flags, args: parsed.positionals });
    return 0;
  } catch (err) {
    if (err instanceof CliError) {
      io.err(`error: ${err.message}`);
      return err.exitCode;
    }
    io.err(`error: ${(err as Error).message}`);
    if (flags.verbose) io.err((err as Error).stack ?? '');
    return 1;
  }
}
