export interface DbError {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

export interface DbResult<T> {
  data: T | null;
  error: DbError | null;
}

/**
 * Minimal structural interface for the PostgREST methods used by the gateway.
 * Keeping this local means unit tests do not need to import supabase-js.
 */
export interface DbClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<DbResult<unknown>>;
}

export function requireData<T>(result: DbResult<T>, context: string): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${context}: no data returned`);
  return result.data;
}

export function optionalData<T>(result: DbResult<T>, context: string): T | null {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}
