/**
 * Structured logging utility with request correlation IDs.
 *
 * Every log line is JSON so downstream tools (Datadog, CloudWatch, etc.)
 * can parse and index fields without regex.
 *
 * Usage:
 *   import { createLogger } from '@/lib/logger';
 *   const log = createLogger('api/bookings');
 *   log.info('booking created', { blockId: '...', childId: '...' });
 *
 * With request correlation:
 *   import { withCorrelationId, getCorrelationId } from '@/lib/logger';
 *   const correlationId = withCorrelationId(req);
 *   const log = createLogger('api/bookings', correlationId);
 */

import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  correlation_id?: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LEVEL];
}

function emit(entry: LogEntry): void {
  const { level, ...rest } = entry;
  const line = JSON.stringify({ level, ...rest });

  switch (level) {
    case 'error':
      console.error(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    default:
      console.log(line);
  }
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/**
 * Create a structured logger scoped to a context (e.g. route name).
 */
export function createLogger(context: string, correlationId?: string): Logger {
  function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (!shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message,
      ...(correlationId ? { correlation_id: correlationId } : {}),
      ...(data ?? {}),
    };

    emit(entry);
  }

  return {
    debug: (msg, data?) => log('debug', msg, data),
    info: (msg, data?) => log('info', msg, data),
    warn: (msg, data?) => log('warn', msg, data),
    error: (msg, data?) => log('error', msg, data),
  };
}

/**
 * Extract or generate a correlation ID from a request.
 *
 * Checks for an existing `X-Correlation-ID` or `X-Request-ID` header.
 * If none found, generates a new UUID.
 */
export function getCorrelationId(req: NextRequest): string {
  return (
    req.headers.get('x-correlation-id') ||
    req.headers.get('x-request-id') ||
    randomUUID()
  );
}

/**
 * Shorthand: extract correlation ID and return it.
 * The caller should pass it to `createLogger()` and include it
 * in the response via the `X-Correlation-ID` header.
 */
export function withCorrelationId(req: NextRequest): string {
  return getCorrelationId(req);
}
