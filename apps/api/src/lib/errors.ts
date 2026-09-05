import { logger } from './logger';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_REFERENCE'
  | 'INTERNAL';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function httpError(
  status: number,
  code: ErrorCode,
  message: string,
  details?: unknown,
): HttpError {
  return new HttpError(status, code, message, details);
}

export function errorEnvelope(err: unknown): {
  status: number;
  body: { error: { code: ErrorCode; message: string; details?: unknown } };
} {
  if (err instanceof HttpError) {
    return {
      status: err.status,
      body: { error: { code: err.code, message: err.message, details: err.details } },
    };
  }
  logger.error('error.unhandled', {
    err: err instanceof Error ? { name: err.name, message: err.message } : String(err),
  });
  return { status: 500, body: { error: { code: 'INTERNAL', message: 'Internal server error' } } };
}
