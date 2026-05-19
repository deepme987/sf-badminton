/**
 * Tiny helpers for route handlers.
 *
 * - `requireDeviceId(req)` extracts the `X-Device-Id` header or throws 401.
 * - `parseBody(req, schema)` parses + validates JSON with zod.
 * - `errorResponse(err)` maps `ServiceError` and zod errors to the standard
 *   error envelope: `{ error: { code, message, details? } }`.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { ServiceError, isServiceError } from '../errors';

export const DEVICE_ID_HEADER = 'x-device-id';

export function requireDeviceId(req: NextRequest): string {
  const id = req.headers.get(DEVICE_ID_HEADER);
  if (!id || id.trim() === '') {
    throw new ServiceError('validation_failed', 'X-Device-Id header required');
  }
  return id.trim();
}

export function optionalDeviceId(req: NextRequest): string | null {
  const id = req.headers.get(DEVICE_ID_HEADER);
  if (!id || id.trim() === '') return null;
  return id.trim();
}

export async function parseBody<S extends ZodTypeAny>(
  req: NextRequest,
  schema: S,
): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ServiceError('validation_failed', 'request body must be valid JSON');
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ServiceError('validation_failed', 'invalid request body', {
      issues: result.error.issues,
    });
  }
  return result.data;
}

export function errorResponse(err: unknown): NextResponse {
  if (isServiceError(err)) {
    return NextResponse.json(
      {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
        },
      },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: 'validation_failed',
          message: 'invalid request',
          details: { issues: err.issues },
        },
      },
      { status: 400 },
    );
  }
  // eslint-disable-next-line no-console
  console.error('[api] unhandled error', err);
  return NextResponse.json(
    {
      error: {
        code: 'internal_error',
        message: 'unexpected error',
      },
    },
    { status: 500 },
  );
}
