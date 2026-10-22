import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import type { DbClient } from '../_shared/db.ts';
import { AppError } from '../_shared/errors.ts';
import { createQuotaGateway } from '../_shared/quota.ts';

interface QueryCall {
  table: string;
  filters: Array<[string, unknown]>;
  count?: string;
  head?: boolean;
}

function mockDb(options: { globalRequests?: number | null; rpmCount?: number }) {
  const calls: QueryCall[] = [];
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
    rpc() {
      throw new Error('not used by this test');
    },
  } as unknown as DbClient;

  return { db, calls };
}

function gatewayFor(db: DbClient) {
  return createQuotaGateway(db, () => db);
}

const now = new Date('2026-10-22T12:00:00.000Z');

Deno.test('quota rate limit: blank limits do not query the database', async () => {
  const { db, calls } = mockDb({});
  await gatewayFor(db).checkRateLimit({ rpm: null, rpd: null, now });
  assertEquals(calls, []);
});

Deno.test('quota rate limit: RPD reads the UTC daily counter and blocks at the limit', async () => {
  const { db, calls } = mockDb({ globalRequests: 5 });
  const error = await assertRejects(
    () => gatewayFor(db).checkRateLimit({ rpm: null, rpd: 5, now }),
    AppError,
  );
  assertEquals(error.code, 'quota_exceeded');
  assertEquals(calls[0]?.table, 'ai_global_daily');
  assertEquals(calls[0]?.filters, [['day', '2026-10-22']]);
});

Deno.test('quota rate limit: RPM counts uncached events in the last minute', async () => {
  const { db, calls } = mockDb({ rpmCount: 2 });
  const error = await assertRejects(
    () => gatewayFor(db).checkRateLimit({ rpm: 2, rpd: null, now }),
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

Deno.test('quota rate limit: below both limits resolves', async () => {
  const { db } = mockDb({ globalRequests: 4, rpmCount: 1 });
  await gatewayFor(db).checkRateLimit({ rpm: 2, rpd: 5, now });
});
