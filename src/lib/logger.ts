type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ||
  (process.env.NODE_ENV === "production" ? "info" : "debug");

function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, -1);
}

/**
 * Extracts the filename and line number of the caller from the V8 stack trace.
 * Acts as an NLog-style caller context injector.
 */
function getCallerInfo(): string {
  const err = new Error();
  const stack = err.stack?.split("\n") || [];
  // stack[0] is 'Error'
  // stack[1] is 'getCallerInfo'
  // stack[2] is the logger method (e.g. 'error' or 'info')
  // stack[3] is the actual caller in the application code
  const callerLine = stack[3] || "";
  
  const match = callerLine.match(/(?:at\s+.*?\s+\(|at\s+)(.*?:\d+:\d+)\)?/);
  if (match && match[1]) {
    const fullPath = match[1];
    const parts = fullPath.split("/");
    // Keep just the last two parts of the path for clean logs (e.g. "api/route.ts:45:12")
    return parts.length > 2 ? parts.slice(-2).join("/") : fullPath;
  }
  return "unknown";
}

function fmt(level: LogLevel, mod: string): string {
  const caller = getCallerInfo();
  return `${ts()} ${level.toUpperCase().padEnd(5)} [${mod}] [${caller}]`;
}

export type Logger = {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export function createLogger(mod: string): Logger {
  return {
    debug(...args: unknown[]) {
      if (LEVELS.debug >= LEVELS[MIN_LEVEL])
        console.debug(fmt("debug", mod), ...args);
    },
    info(...args: unknown[]) {
      if (LEVELS.info >= LEVELS[MIN_LEVEL])
        console.log(fmt("info", mod), ...args);
    },
    warn(...args: unknown[]) {
      if (LEVELS.warn >= LEVELS[MIN_LEVEL])
        console.warn(fmt("warn", mod), ...args);
    },
    error(...args: unknown[]) {
      console.error(fmt("error", mod), ...args);
    },
  };
}

export const logger = createLogger("app");
