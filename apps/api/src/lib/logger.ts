export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = Record<string, unknown> & {
  requestId?: string;
  userId?: string;
};

function emit(level: LogLevel, msg: string, ctx?: LogContext): void {
  try {
    const payload = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...ctx,
    };
    const line = JSON.stringify(payload);
    if (level === 'error' || level === 'warn') console.error(line);
    else console.log(line);
  } catch {
    try {
      if (level === 'error' || level === 'warn') console.error(`[${level}] ${msg}`);
      else console.log(`[${level}] ${msg}`);
    } catch {
      // swallow
    }
  }
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => emit('debug', msg, ctx),
  info: (msg: string, ctx?: LogContext) => emit('info', msg, ctx),
  warn: (msg: string, ctx?: LogContext) => emit('warn', msg, ctx),
  error: (msg: string, ctx?: LogContext) => emit('error', msg, ctx),
};
