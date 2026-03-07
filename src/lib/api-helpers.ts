/**
 * API route helpers: correlation IDs, response wrappers, and error metrics.
 *
 * Wraps API route handlers with automatic correlation ID propagation,
 * request/response logging, and duration tracking.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger, withCorrelationId, Logger } from '@/lib/logger';

export interface ApiContext {
  correlationId: string;
  log: Logger;
}

type RouteHandler = (
  req: NextRequest,
  ctx: ApiContext,
  params?: unknown,
) => Promise<NextResponse>;

/**
 * Wrap an API route handler with observability:
 * - Generates / propagates X-Correlation-ID
 * - Logs request start & finish with duration
 * - Catches unhandled errors and returns 500
 * - Attaches correlation ID to the response header
 */
export function withObservability(routeName: string, handler: RouteHandler): (req: NextRequest, params?: unknown) => Promise<NextResponse> {
  return async (req: NextRequest, params?: unknown) => {
    const correlationId = withCorrelationId(req);
    const log = createLogger(routeName, correlationId);

    const start = Date.now();
    log.info('request started', {
      method: req.method,
      path: req.nextUrl.pathname,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
    });

    try {
      const response = await handler(req, { correlationId, log }, params);

      response.headers.set('X-Correlation-ID', correlationId);

      const durationMs = Date.now() - start;
      log.info('request completed', {
        method: req.method,
        path: req.nextUrl.pathname,
        status: response.status,
        duration_ms: durationMs,
      });

      return response;
    } catch (err) {
      const durationMs = Date.now() - start;
      log.error('unhandled error', {
        method: req.method,
        path: req.nextUrl.pathname,
        duration_ms: durationMs,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });

      const errorResponse = NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
      errorResponse.headers.set('X-Correlation-ID', correlationId);
      return errorResponse;
    }
  };
}
