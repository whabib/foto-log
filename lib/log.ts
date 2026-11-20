/**
 * Server logging.
 *
 * In production each entry is one line of JSON on stdout, which Cloud
 * Logging reads as a structured entry: `severity` sets the level,
 * `message` is the summary line, and every other field is searchable
 * (`jsonPayload.did="did:plc:…"`). An ERROR entry that carries an Error
 * also gets its stack in `stack_trace`, which Error Reporting groups.
 *
 * In development (or with LOG_FORMAT=pretty) it logs through the console
 * as before, so errors stay readable in the terminal. LOG_FORMAT=json forces
 * JSON anywhere.
 */

export type Severity = "DEBUG" | "INFO" | "WARNING" | "ERROR";
export type LogFields = Record<string, unknown>;

function structured(): boolean {
  const format = process.env.LOG_FORMAT;
  if (format === "json") return true;
  if (format === "pretty") return false;
  return process.env.NODE_ENV === "production";
}

/** Most levels of `cause` to follow, so a cycle can't recurse forever. */
const MAX_CAUSE_DEPTH = 5;

/** An Error as plain data: name, message, stack, cause, and its own simple fields (status, code, …). */
export function serializeError(err: Error, depth = 0): Record<string, unknown> {
  const out: Record<string, unknown> = { name: err.name, message: err.message };
  for (const [key, value] of Object.entries(err)) {
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) out[key] = value;
  }
  if (err.stack) out.stack = err.stack;
  if (err.cause !== undefined && depth < MAX_CAUSE_DEPTH) {
    out.cause = err.cause instanceof Error ? serializeError(err.cause, depth + 1) : err.cause;
  }
  return out;
}

function firstError(fields: LogFields | undefined): Error | undefined {
  if (!fields) return undefined;
  for (const value of Object.values(fields)) {
    if (value instanceof Error) return value;
  }
  return undefined;
}

/** The JSON line for one entry. Exported for tests. */
export function formatEntry(severity: Severity, message: string, fields?: LogFields): string {
  const entry: Record<string, unknown> = { ...fields, severity, message };
  const err = severity === "ERROR" ? firstError(fields) : undefined;
  if (err?.stack) entry.stack_trace = err.stack;
  const seen = new WeakSet<object>();
  const replacer = (_key: string, value: unknown) => {
    if (value instanceof Error) return serializeError(value);
    if (typeof value === "bigint") return value.toString();
    if (value instanceof URL) return value.toString();
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    return value;
  };
  try {
    return JSON.stringify(entry, replacer);
  } catch (e) {
    return JSON.stringify({ severity, message, logError: String(e) });
  }
}

const CONSOLE: Record<Severity, (...args: unknown[]) => void> = {
  DEBUG: (...a) => console.debug(...a),
  INFO: (...a) => console.info(...a),
  WARNING: (...a) => console.warn(...a),
  ERROR: (...a) => console.error(...a),
};

function write(severity: Severity, message: string, fields?: LogFields): void {
  if (!structured()) {
    if (fields && Object.keys(fields).length > 0) CONSOLE[severity](message, fields);
    else CONSOLE[severity](message);
    return;
  }
  const line = formatEntry(severity, message, fields) + "\n";
  if (typeof process !== "undefined" && typeof process.stdout?.write === "function") process.stdout.write(line);
  else console.log(line.trimEnd());
}

export const log = {
  debug: (message: string, fields?: LogFields) => write("DEBUG", message, fields),
  info: (message: string, fields?: LogFields) => write("INFO", message, fields),
  warn: (message: string, fields?: LogFields) => write("WARNING", message, fields),
  error: (message: string, fields?: LogFields) => write("ERROR", message, fields),
};
