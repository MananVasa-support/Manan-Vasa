/**
 * Hard wall-clock timeout for a DB await.
 *
 * Why this exists: against the Supabase transaction pooler, a warm Vercel
 * instance can hand out a connection the pooler already bounced. A query sent on
 * that dead socket does NOT throw and does NOT resolve — postgres-js waits on TCP
 * (keep-alive ≈60s) before it ever errors. Server Components `await` that query,
 * so the whole page hangs on its skeleton "forever" (the recurring intermittent
 * "stuck on Loading…" incident). `try/catch` can't save you — there's no error to
 * catch, only an await that never settles.
 *
 * `withTimeout` races the await against a timer so a hang becomes a fast
 * rejection. Callers that already fail-open (e.g. the layout gates) then degrade
 * gracefully instead of hanging; the abandoned query's dead connection is
 * recycled by postgres-js's idle/keep-alive cleanup, and the user's retry lands
 * on a fresh connection. Legitimate queries here are <200ms, so a multi-second
 * timeout only ever trips on a genuine hang — never on healthy load.
 */
export class DbTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`DB timeout: "${label}" did not settle within ${ms}ms (likely a stale pooled connection)`);
    this.name = "DbTimeoutError";
  }
}

export function withTimeout<T>(
  work: Promise<T> | PromiseLike<T>,
  ms: number,
  label = "query",
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DbTimeoutError(label, ms)), ms);
    Promise.resolve(work).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Like {@link withTimeout} but never rejects — on timeout OR error it returns
 * `fallback` (and logs). For non-critical, fail-open reads where a transient DB
 * blip must not break the page: gates, org settings, optional side panels.
 */
export async function withTimeoutOr<T>(
  work: Promise<T> | PromiseLike<T>,
  ms: number,
  fallback: T,
  label = "query",
): Promise<T> {
  try {
    return await withTimeout(work, ms, label);
  } catch (err) {
    console.warn(`[db-timeout] ${label} fell back:`, (err as Error)?.message ?? err);
    return fallback;
  }
}

/**
 * Run a DB read with a hard timeout, and on timeout/error RETRY on a fresh
 * connection — the durable cure for the stale-pooled-connection hang.
 *
 * Why this works: when `withTimeout` trips, postgres-js is still draining the
 * abandoned query on its (stale) connection, so that connection stays reserved.
 * The next call therefore lands on a DIFFERENT pooled connection — or opens a
 * brand-new one — which is almost always healthy. So a request that would have
 * shown the 18s error card instead succeeds a few seconds later, transparently.
 *
 * CRITICAL: `make` must be a FACTORY that builds a fresh promise each call
 * (e.g. `() => db.select()...` or `() => Promise.all([...])`). Passing an
 * already-started promise would just re-await the same stuck query.
 *
 * Each attempt gets its own timeout. Keep the first timeout tight (a healthy
 * query is <1s) so a stale hit is detected fast and the retry happens quickly.
 */
export async function withRetry<T>(
  make: () => Promise<T> | PromiseLike<T>,
  opts: { attempts?: number; timeoutMs: number | number[]; label?: string },
): Promise<T> {
  const { attempts = 2, timeoutMs, label = "query" } = opts;
  const msFor = (i: number) =>
    Array.isArray(timeoutMs) ? (timeoutMs[i] ?? timeoutMs[timeoutMs.length - 1]!) : timeoutMs;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await withTimeout(make(), msFor(i), i === 0 ? label : `${label}-retry${i}`);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        console.warn(
          `[db-retry] ${label} attempt ${i + 1}/${attempts} failed (${(err as Error)?.message ?? err}); retrying on a fresh connection`,
        );
      }
    }
  }
  throw lastErr;
}
