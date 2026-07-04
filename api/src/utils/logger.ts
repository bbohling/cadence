/**
 * Simple structured logger.
 *
 * Outputs JSON in production (easy to parse with log aggregators)
 * and human-readable colored text in development.
 *
 * WHY NOT a logging library? For a single-user app running on one
 * droplet, this is more than enough. No dependency to maintain.
 *
 * USAGE:
 *   import { log } from "@/utils/logger";
 *   log.info("Synced activities", { count: 42 });
 *   log.error("Sync failed", { error: err.message });
 */

type LogLevel = "debug" | "info" | "warn" | "error";

/** Extra context you can attach to any log message */
type LogContext = Record<string, unknown>;

const isDev = process.env.NODE_ENV !== "production";

/** ANSI color codes for terminal output */
const colors: Record<LogLevel, string> = {
  debug: "\x1b[90m",  // gray
  info: "\x1b[36m",   // cyan
  warn: "\x1b[33m",   // yellow
  error: "\x1b[31m",  // red
};
const reset = "\x1b[0m";

function formatDev(level: LogLevel, message: string, ctx?: LogContext): string {
  const time = new Date().toLocaleTimeString("en-US", { hour12: false });
  const color = colors[level];
  const prefix = `${color}[${time}] ${level.toUpperCase().padEnd(5)}${reset}`;
  const contextStr = ctx ? ` ${JSON.stringify(ctx)}` : "";
  return `${prefix} ${message}${contextStr}`;
}

function formatProd(level: LogLevel, message: string, ctx?: LogContext): string {
  return JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...ctx,
  });
}

function write(level: LogLevel, message: string, ctx?: LogContext): void {
  const output = isDev ? formatDev(level, message, ctx) : formatProd(level, message, ctx);

  if (level === "error") {
    console.error(output);
  } else if (level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const log = {
  debug: (msg: string, ctx?: LogContext) => write("debug", msg, ctx),
  info: (msg: string, ctx?: LogContext) => write("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => write("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => write("error", msg, ctx),
};
