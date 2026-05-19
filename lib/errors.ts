/**
 * Service-layer error model. Services throw `ServiceError` so route handlers
 * can map cleanly to HTTP status codes without leaking SQL details.
 */

export type ServiceErrorCode =
  | 'validation_failed'
  | 'unauthorized'
  | 'not_found'
  | 'conflict'
  | 'internal_error';

const STATUS_BY_CODE: Record<ServiceErrorCode, number> = {
  validation_failed: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  internal_error: 500,
};

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ServiceErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export function isServiceError(err: unknown): err is ServiceError {
  return err instanceof ServiceError;
}
