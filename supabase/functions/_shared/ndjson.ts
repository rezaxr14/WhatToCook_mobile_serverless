import type { NDJSONEvent } from '../../../packages/shared/src/ai-contracts.ts';
import { asAppError } from './errors.ts';

export interface NDJSONWriter {
  readonly signal: AbortSignal;
  write(event: NDJSONEvent): void;
  close(): void;
}

export type NDJSONProducer = (writer: NDJSONWriter) => Promise<void>;

export function ndjsonResponse(
  request: Request,
  corsHeaders: Headers,
  producer: NDJSONProducer,
): Response {
  const controller = new AbortController();
  let closed = false;

  const onRequestAbort = () => controller.abort(request.signal.reason);
  if (request.signal.aborted) controller.abort(request.signal.reason);
  else request.signal.addEventListener('abort', onRequestAbort, { once: true });

  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;

  const writer: NDJSONWriter = {
    get signal() {
      return controller.signal;
    },
    write(event) {
      if (closed || !streamController) return;
      try {
        streamController.enqueue(new TextEncoder().encode(`${JSON.stringify(event)}\n`));
      } catch {
        closed = true;
        controller.abort();
      }
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        streamController?.close();
      } catch {
        // Already closed/cancelled by the client.
      }
    },
  };

  const stream = new ReadableStream<Uint8Array>({
    start(stream) {
      streamController = stream;
      void (async () => {
        try {
          await producer(writer);
        } catch (error) {
          if (!controller.signal.aborted) {
            const appError = asAppError(error);
            writer.write({
              type: 'error',
              code: appError.code,
              message: appError.message,
              resets_at: appError.resetsAt,
              retry_after: appError.retryAfter,
            });
          }
        } finally {
          request.signal.removeEventListener('abort', onRequestAbort);
          writer.close();
        }
      })();
    },
    cancel() {
      closed = true;
      controller.abort(new DOMException('Client cancelled the stream.', 'AbortError'));
      request.signal.removeEventListener('abort', onRequestAbort);
    },
  });

  const headers = new Headers(corsHeaders);
  headers.set('Content-Type', 'application/x-ndjson; charset=utf-8');
  headers.set('Cache-Control', 'no-cache, no-transform');
  headers.set('X-Accel-Buffering', 'no');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(stream, { status: 200, headers });
}

export function writeMeta(
  writer: NDJSONWriter,
  event: Extract<NDJSONEvent, { type: 'meta' }>,
): void {
  writer.write(event);
}

export function writeDelta(writer: NDJSONWriter, text: string): void {
  if (!text) return;
  writer.write({ type: 'delta', text });
}

export function writeFinal(
  writer: NDJSONWriter,
  event: Extract<NDJSONEvent, { type: 'final' }>,
): void {
  writer.write(event);
}
