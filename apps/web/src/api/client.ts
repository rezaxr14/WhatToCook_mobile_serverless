/**
 * Shared error contract for the web client.
 *
 * Supabase PostgREST/Auth errors are normalized here so pages can keep using
 * `ApiError` for retry-after and machine-readable codes after the Django
 * client was removed.
 */

/** Human readable countdown (e.g. "45s", "2 min"). */
export function formatRetryAfter(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.round(m / 60)}h ${m % 60}m` : `${m} min`;
}

export class ApiError extends Error {
  status: number;
  retryAfter: number | null;
  code: string | null;

  constructor(
    message: string,
    status: number,
    retryAfter: number | null = null,
    code: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfter = retryAfter;
    this.code = code;
  }
}

type ErrorLike = {
  message?: unknown;
  status?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  context?: { status?: unknown };
};

/** Normalize Supabase/JS errors into one error type for the UI. */
export function toApiError(error: unknown, fallback = 'Something went wrong.'): ApiError {
  if (error instanceof ApiError) return error;

  const value = (error ?? {}) as ErrorLike;
  const message =
    typeof value.message === 'string' && value.message.trim() ? value.message : fallback;
  const status =
    typeof value.status === 'number'
      ? value.status
      : typeof value.context?.status === 'number'
        ? value.context.status
        : 500;
  const code = typeof value.code === 'string' ? value.code : null;

  return new ApiError(message, status, null, code);
}

/** True when an error means the Supabase project is unreachable/misconfigured. */
export function isConfigurationError(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'supabase_not_configured';
}
