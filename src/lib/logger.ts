/** Minimal structured logger. Keeps output greppable and dependency-free. */
type Level = "info" | "warn" | "error" | "debug";

function emit(level: Level, msg: string, meta?: Record<string, unknown>): void {
  const line = meta && Object.keys(meta).length > 0
    ? `[${level.toUpperCase()}] ${msg} ${JSON.stringify(meta)}`
    : `[${level.toUpperCase()}] ${msg}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
  debug: (msg: string, meta?: Record<string, unknown>) => emit("debug", msg, meta),
};
