type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

function formatTimestamp(): string {
  return new Date().toISOString();
}

function logMessage(level: LogLevel, context: string, message: string, data?: unknown): void {
  const timestamp = formatTimestamp();
  const prefix = `[${timestamp}] [${level}] [${context}]`;
  if (data !== undefined) {
    if (level === 'ERROR') {
      console.error(`${prefix} ${message}`, data);
    } else if (level === 'WARN') {
      console.warn(`${prefix} ${message}`, data);
    } else {
      console.log(`${prefix} ${message}`, data);
    }
  } else {
    if (level === 'ERROR') {
      console.error(`${prefix} ${message}`);
    } else if (level === 'WARN') {
      console.warn(`${prefix} ${message}`);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }
}

export const logger = {
  info: (context: string, message: string, data?: unknown) => logMessage('INFO', context, message, data),
  warn: (context: string, message: string, data?: unknown) => logMessage('WARN', context, message, data),
  error: (context: string, message: string, data?: unknown) => logMessage('ERROR', context, message, data),
  debug: (context: string, message: string, data?: unknown) => logMessage('DEBUG', context, message, data),
};
