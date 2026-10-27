import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SECRET_KEY = /(token|secret|password|passwd|api[-_]?key|authorization|cookie|credential)/i;
const SECRET_VALUE = [
  /figd_[A-Za-z0-9_-]{10,}/g,
  /sk-ant-[A-Za-z0-9_-]{10,}/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /Bearer\s+[A-Za-z0-9._-]{10,}/g,
  /BSA[A-Za-z0-9_-]{20,}/g,
];

/** Recursively removes secret-looking keys and values so logs never contain credentials. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[depth-limit]';
  if (typeof value === 'string') {
    let out = value;
    for (const re of SECRET_VALUE) out = out.replace(re, '[REDACTED]');
    return out.length > 4000 ? `${out.slice(0, 4000)}…[truncated ${out.length - 4000} chars]` : out;
  }
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    if (value instanceof Error) return { name: value.name, message: redact(value.message, depth + 1), stack: value.stack?.split('\n').slice(0, 6).join('\n') };
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEY.test(k) ? '[REDACTED]' : redact(v, depth + 1);
    return out;
  }
  return value;
}

export interface LogRecord {
  ts: string;
  level: LogLevel;
  component: string;
  msg: string;
  data?: unknown;
}

export interface LogSink {
  write(record: LogRecord): void;
}

/** Appends JSON lines to `<dir>/<yyyy-mm-dd>.jsonl`. */
export class JsonlFileSink implements LogSink {
  constructor(private readonly dir: string) {}
  write(record: LogRecord): void {
    const file = join(this.dir, `${record.ts.slice(0, 10)}.jsonl`);
    try {
      mkdirSync(dirname(file), { recursive: true });
      appendFileSync(file, JSON.stringify(record) + '\n');
    } catch {
      // Logging must never crash the runtime (e.g. workspace deleted mid-run).
    }
  }
}

/** Human-readable sink on stderr. stdout is reserved for command output and the MCP protocol. */
export class StderrSink implements LogSink {
  write(record: LogRecord): void {
    const data = record.data === undefined ? '' : ` ${JSON.stringify(record.data)}`;
    process.stderr.write(`[${record.level}] ${record.component}: ${record.msg}${data}\n`);
  }
}

export class MemorySink implements LogSink {
  readonly records: LogRecord[] = [];
  write(record: LogRecord): void {
    this.records.push(record);
  }
}

export class Logger {
  constructor(
    private readonly component: string,
    private readonly sinks: LogSink[] = [],
    private readonly minLevel: LogLevel = (process.env.MAGEC_LOG_LEVEL as LogLevel) || 'info',
    private readonly stderrMinLevel: LogLevel = 'warn',
  ) {}

  child(component: string): Logger {
    return new Logger(`${this.component}.${component}`, this.sinks, this.minLevel, this.stderrMinLevel);
  }

  withSink(sink: LogSink): Logger {
    return new Logger(this.component, [...this.sinks, sink], this.minLevel, this.stderrMinLevel);
  }

  log(level: LogLevel, msg: string, data?: unknown): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    const record: LogRecord = { ts: new Date().toISOString(), level, component: this.component, msg: redact(msg) as string };
    if (data !== undefined) record.data = redact(data);
    for (const sink of this.sinks) {
      if (sink instanceof StderrSink && LEVEL_ORDER[level] < LEVEL_ORDER[this.stderrMinLevel]) continue;
      sink.write(record);
    }
  }

  debug(msg: string, data?: unknown): void { this.log('debug', msg, data); }
  info(msg: string, data?: unknown): void { this.log('info', msg, data); }
  warn(msg: string, data?: unknown): void { this.log('warn', msg, data); }
  error(msg: string, data?: unknown): void { this.log('error', msg, data); }
}

export function createLogger(component: string, opts: { logDir?: string; stderr?: boolean; level?: LogLevel } = {}): Logger {
  const sinks: LogSink[] = [];
  if (opts.logDir) sinks.push(new JsonlFileSink(opts.logDir));
  if (opts.stderr ?? true) sinks.push(new StderrSink());
  return new Logger(component, sinks, opts.level);
}

export const silentLogger = new Logger('silent', []);
