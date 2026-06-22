import { randomUUID } from 'node:crypto'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  correlationId: string
  actorId?: string
  requestId?: string
  [key: string]: unknown
}

export interface StructuredLogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context: LogContext & Record<string, unknown>
  error?: {
    name: string
    message: string
    stack?: string
  }
  duration?: number
  /** Arbitrary extra fields merged into context for logging */
  [key: string]: unknown
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const currentLevel = LOG_LEVELS[(process.env['LOG_LEVEL'] as LogLevel) ?? 'info'] ?? LOG_LEVELS.info

function formatLog(entry: StructuredLogEntry): string {
  if (process.env['NODE_ENV'] === 'production') {
    return JSON.stringify(entry)
  }
  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`
  const ctx = entry.context.correlationId ? ` [${entry.context.correlationId.slice(0, 8)}]` : ''
  const msg = ` ${entry.message}`
  const extra = Object.keys(entry.context).length > 1
    ? ` ${JSON.stringify(Object.fromEntries(Object.entries(entry.context).filter(([k]) => k !== 'correlationId')))}`
    : ''
  return `${prefix}${ctx}${msg}${extra}`
}

function log(level: LogLevel, message: string, context: LogContext & Record<string, unknown>, extra?: Omit<Partial<StructuredLogEntry>, 'level' | 'message' | 'context'>): void {
  if (LOG_LEVELS[level] < currentLevel) return

  const entry: StructuredLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
    ...extra,
  }

  const formatted = formatLog(entry)

  switch (level) {
    case 'error':
      console.error(formatted)
      break
    case 'warn':
      console.warn(formatted)
      break
    default:
      console.log(formatted)
  }
}

export function createLogger(context: Partial<LogContext> = {}) {
  const baseContext: LogContext = {
    correlationId: context.correlationId ?? randomUUID(),
    ...context,
  }

  return {
    debug(message: string, extra?: Partial<StructuredLogEntry>) {
      log('debug', message, baseContext, extra)
    },
    info(message: string, extra?: Partial<StructuredLogEntry>) {
      log('info', message, baseContext, extra)
    },
    warn(message: string, extra?: Partial<StructuredLogEntry>) {
      log('warn', message, baseContext, extra)
    },
    error(message: string, error?: Error, extra?: Partial<StructuredLogEntry>) {
      log('error', message, baseContext, {
        ...extra,
        error: error
          ? { name: error.name, message: error.message, stack: error.stack }
          : undefined,
      })
    },
    child(overrides: Partial<LogContext & Record<string, unknown>>) {
      return createLogger({ ...baseContext, ...overrides })
    },
    withCorrelationId(correlationId: string) {
      return createLogger({ ...baseContext, correlationId })
    },
  }
}

export function generateCorrelationId(): string {
  return randomUUID()
}
