import type { AIErrorCode } from '../../../packages/shared/src/ai-contracts.ts';

export class AppError extends Error {
  readonly status: number;
  readonly code: AIErrorCode;
  readonly details?: unknown;
  readonly resetsAt?: string;
  readonly retryAfter?: number;

  constructor(
    code: AIErrorCode,
    message: string,
    status: number,
    options: {
      details?: unknown;
      resetsAt?: string;
      retryAfter?: number;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = options.details;
    this.resetsAt = options.resetsAt;
    this.retryAfter = options.retryAfter;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

export function unauthorized(message = 'Sign in to use AI features.'): AppError {
  return new AppError('unauthorized', message, 401);
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError('bad_request', message, 400, { details });
}

export function originNotAllowed(origin: string): AppError {
  return new AppError('origin_not_allowed', 'This web origin is not allowed to call AI.', 403, {
    details: { origin },
  });
}

export function payloadTooLarge(message: string): AppError {
  return new AppError('payload_too_large', message, 413);
}

export function quotaExceeded(message: string, resetsAt?: string): AppError {
  return new AppError('quota_exceeded', message, 429, { resetsAt });
}

export function rateLimited(message: string, retryAfter: number): AppError {
  return new AppError('rate_limited', message, 429, { retryAfter });
}

export function aiDisabled(message = 'AI features are temporarily disabled.'): AppError {
  return new AppError('ai_disabled', message, 503);
}

export function budgetExhausted(
  message = 'The daily AI budget has been reached. Try again after the daily reset.',
): AppError {
  return new AppError('ai_budget_exhausted', message, 503);
}

export function providerError(message = 'The AI provider failed. Please try again.', cause?: unknown): AppError {
  return new AppError('provider_error', message, 502, { cause });
}

export function invalidModelOutput(message = 'The AI returned an invalid response.'): AppError {
  return new AppError('invalid_model_output', message, 502);
}

export function duplicateRequest(message = 'This request was already completed.'): AppError {
  return new AppError('duplicate_request', message, 409);
}

export function internalError(message = 'Something went wrong.', cause?: unknown): AppError {
  return new AppError('internal_error', message, 500, { cause });
}

export function asAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new AppError('bad_request', 'The request was cancelled.', 499);
  }
  const message = error instanceof Error ? error.message : String(error);
  return mapDatabaseError(message, error);
}

export function mapDatabaseError(message: string, cause?: unknown): AppError {
  const value = message.trim();
  switch (value) {
    case 'ai_kill_switch':
    case 'feature_disabled':
      return aiDisabled();
    case 'daily_limit_exceeded':
      return quotaExceeded('Your daily AI request limit has been reached.', nextUtcMidnight());
    case 'monthly_budget_exceeded':
      return quotaExceeded('Your monthly AI budget has been reached.', nextUtcMonth());
    case 'global_budget_exceeded':
      return budgetExhausted();
    case 'profile_not_found':
      return new AppError('unauthorized', 'Your profile is not available. Sign in again.', 403);
    case 'not_authenticated':
      return unauthorized();
    case 'invalid_arguments':
    case 'invalid_reserved_amount':
    case 'invalid_event_id':
    case 'invalid_cost':
      return badRequest('The AI request was invalid.', { database: value });
    case 'event_not_found':
      return internalError('The AI usage event could not be found.', cause);
    default:
      break;
  }

  if (value.includes('daily_limit_exceeded')) {
    return quotaExceeded('Your daily AI request limit has been reached.', nextUtcMidnight());
  }
  if (value.includes('monthly_budget_exceeded')) {
    return quotaExceeded('Your monthly AI budget has been reached.', nextUtcMonth());
  }
  if (value.includes('global_budget_exceeded')) return budgetExhausted();
  if (value.includes('ai_kill_switch') || value.includes('feature_disabled')) return aiDisabled();

  return internalError('The AI service could not complete the request.', cause);
}

export function nextUtcMidnight(now = new Date()): string {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next.toISOString();
}

export function nextUtcMonth(now = new Date()): string {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return next.toISOString();
}
