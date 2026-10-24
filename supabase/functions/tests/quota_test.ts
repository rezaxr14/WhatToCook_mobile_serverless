import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import type { DbClient } from '../_shared/db.ts';
import { AppError } from '../_shared/errors.ts';
import { createQuotaGateway } from '../_shared/quota.ts';
import type { RateLimitInput } from '../_shared/types.ts';

interface QueryCall {
  table: string;
  filters: Array<[string, unknown]>;
  count?: string;
  head?: boolean;
}

const USER_ID = '11111111-1111-4111-8111-111111111111';

function baseInput(overrides: Partial<RateLimitInput> = {}): RateLimitInput {
  return {
    rpm: null,
    rpd: null,
    userRpm: null,
    anonRpm: null,
    ipRpm: null,
    now,
    userId: USER_ID,
    planId: 'free',
    ipKey: 'a'.repeat(64),
    ...overrides,
  };
}

function mockDb(options: {
  globalRequests?: number | null;
  rpmCount?: number;
  rateLimit?: { allowed: boolean; scope?: string | null; retry_after?: number };
}) {
  const calls: QueryCall[] = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const db = {
    from(table: string) {
      const call: QueryCall = { table, filters: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {
        select(_columns: string, selectOptions?: { count?: string; head?: boolean }) {
          call.count = selectOptions?.count;
          call.head = selectOptions?.head;
          return builder;
        },
        eq(column: string, value: unknown) {
          call.filters.push([column, value]);
          return builder;
        },
        gte(column: string, value: unknown) {
          call.filters.push([column, value]);
          return builder;
        },
        maybeSingle() {
          return Promise.resolve({
            data:
              table === 'ai_global_daily' && options.globalRequests !== null
                ? { requests: options.globalRequests ?? 0 }
                : null,
            error: null,
          });
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve({
            count: options.rpmCount ?? 0,
            data: null,
            error: null,
          }).then(resolve, reject);
        },
      };
      return builder;
    },
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return Promise.resolve({
        data: options.rateLimit ?? { allowed: true, scope: null, retry_after: 0 },
        error: null,
      });
    },
  } as unknown as DbClient;

  return { db, calls, rpcCalls };
}

function gatewayFor(db: DbClient) {
  return createQuotaGateway(db, () => db);
}

const now = new Date('2026-10-22T12:00:00.000Z');

Deno.test('quota rate limit: blank limits do not query the database', async () => {
  const { db, calls, rpcCalls } = mockDb({});
  await gatewayFor(db).checkRateLimit(baseInput());
  assertEquals(calls, []);
  assertEquals(rpcCalls, []);
});

Deno.test('quota rate limit: RPD reads the UTC daily counter and blocks at the limit', async () => {
  const { db, calls } = mockDb({ globalRequests: 5 });
  const error = await assertRejects(
    () => gatewayFor(db).checkRateLimit(baseInput({ rpd: 5 })),
    AppError,
  );
  assertEquals(error.code, 'quota_exceeded');
  assertEquals(calls[0]?.table, 'ai_global_daily');
  assertEquals(calls[0]?.filters, [['day', '2026-10-22']]);
});

Deno.test('quota rate limit: RPM counts uncached events in the last minute', async () => {
  const { db, calls } = mockDb({ rpmCount: 2 });
  const error = await assertRejects(
    () => gatewayFor(db).checkRateLimit(baseInput({ rpm: 2 })),
    AppError,
  );
  assertEquals(error.code, 'rate_limited');
  assertEquals(calls[0]?.table, 'ai_usage_events');
  assertEquals(calls[0]?.count, 'exact');
  assertEquals(calls[0]?.head, true);
  assertEquals(calls[0]?.filters, [
    ['created_at', '2026-10-22T11:59:00.000Z'],
    ['cache_hit', false],
  ]);
});

Deno.test('quota rate limit: below both global limits resolves', async () => {
  const { db } = mockDb({ globalRequests: 4, rpmCount: 1 });
  await gatewayFor(db).checkRateLimit(baseInput({ rpm: 2, rpd: 5 }));
});

Deno.test(
  'quota rate limit: per-user window uses the signed-in limit and the hashed IP',
  async () => {
    const { db, rpcCalls } = mockDb({});
    await gatewayFor(db).checkRateLimit(baseInput({ userRpm: 20, anonRpm: 8, ipRpm: 40 }));

    assertEquals(rpcCalls.length, 1);
    assertEquals(rpcCalls[0]?.name, 'check_ai_rate_limit');
    assertEquals(rpcCalls[0]?.args, {
      p_user_id: USER_ID,
      p_ip_hash: 'a'.repeat(64),
      p_user_limit: 20,
      p_ip_limit: 40,
      p_window_seconds: 60,
      p_now: '2026-10-22T12:00:00.000Z',
    });
  },
);

Deno.test('quota rate limit: anonymous accounts use the stricter anonymous limit', async () => {
  const { db, rpcCalls } = mockDb({});
  await gatewayFor(db).checkRateLimit(
    baseInput({ planId: 'anonymous', userRpm: 20, anonRpm: 8, ipRpm: 40 }),
  );
  assertEquals(rpcCalls[0]?.args.p_user_limit, 8);
});

Deno.test('quota rate limit: a blocked user gets rate_limited with Retry-After', async () => {
  const { db } = mockDb({
    rateLimit: { allowed: false, scope: 'user', retry_after: 42 },
  });
  const error = await assertRejects(
    () => gatewayFor(db).checkRateLimit(baseInput({ userRpm: 20 })),
    AppError,
  );
  assertEquals(error.code, 'rate_limited');
  assertEquals(error.status, 429);
  assertEquals(error.retryAfter, 42);
  assertEquals(error.message, 'Too many AI requests. Please wait a minute and try again.');
});

Deno.test('quota rate limit: an IP block reports the network message', async () => {
  const { db } = mockDb({
    rateLimit: { allowed: false, scope: 'ip', retry_after: 17 },
  });
  const error = await assertRejects(
    () => gatewayFor(db).checkRateLimit(baseInput({ ipRpm: 40 })),
    AppError,
  );
  assertEquals(error.code, 'rate_limited');
  assertEquals(error.retryAfter, 17);
  assertEquals(
    error.message,
    'Too many AI requests from this network. Please wait a minute and try again.',
  );
});

Deno.test('quota rate limit: an absent IP key still checks the per-user window', async () => {
  const { db, rpcCalls } = mockDb({});
  await gatewayFor(db).checkRateLimit(baseInput({ userRpm: 20, ipKey: null }));
  assertEquals(rpcCalls[0]?.args.p_ip_hash, null);
  assertEquals(rpcCalls[0]?.args.p_user_limit, 20);
});
