export interface StructuredLogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: string;
  correlationId: string;
  context?: Record<string, unknown>;
  [key: string]: unknown;
}

export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

export function hashIP(ip: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + (process.env.IP_HASH_SECRET || 'default-secret'));
  return Array.from(new Uint8Array(data))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hashUserAgent(ua: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(ua + (process.env.IP_HASH_SECRET || 'default-secret'));
  return Array.from(new Uint8Array(data))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function createLogger(defaults: { component: string }) {
  function log(level: 'info' | 'warn' | 'error' | 'debug', message: string, extra?: Omit<Partial<StructuredLogEntry>, 'level' | 'message' | 'context'>) {
    const entry: StructuredLogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      correlationId: extra?.correlationId || generateCorrelationId(),
      component: defaults.component,
      ...extra,
    };
    if (level === 'error') console.error(JSON.stringify(entry));
    else if (level === 'warn') console.warn(JSON.stringify(entry));
    else console.log(JSON.stringify(entry));
  }

  return {
    info: (message: string, extra?: Omit<Partial<StructuredLogEntry>, 'level' | 'message' | 'context'>) => log('info', message, extra),
    warn: (message: string, extra?: Omit<Partial<StructuredLogEntry>, 'level' | 'message' | 'context'>) => log('warn', message, extra),
    error: (message: string, error?: Error, extra?: Omit<Partial<StructuredLogEntry>, 'level' | 'message' | 'context'>) =>
      log('error', message, { ...extra, error: error?.message, stack: error?.stack }),
    debug: (message: string, extra?: Omit<Partial<StructuredLogEntry>, 'level' | 'message' | 'context'>) => log('debug', message, extra),
  };
}