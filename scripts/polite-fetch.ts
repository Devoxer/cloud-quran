/**
 * A throttled, retrying GET for the content scrapers (story 8-5) — QUL and QuranEnc's browse pages.
 *
 * ⚠️ ONE REQUEST AT A TIME, WITH A GAP, AND A BACKOFF ON FAILURE. Both upstreams are somebody
 * else's free service and neither publishes a rate limit; 684 browse pages fired in parallel is how
 * a mirror gets an IP banned halfway through. The scrapers cache every response under `build/`, so
 * this only ever runs for what is not cached yet.
 */

/** The gap between two requests to the same upstream. */
const GAP_MS = 1500;
const lastRequestAt = new Map<string, number>();

/** How long one request may take before it is abandoned and (if idempotent) retried. */
const REQUEST_TIMEOUT_MS = 60_000;
/** The longest `Retry-After` honoured, so a hostile header cannot park a build for a day. */
const MAX_RETRY_AFTER_MS = 5 * 60_000;

/**
 * The wait a `Retry-After` header asks for — seconds or an HTTP date — or `null` when absent.
 * Exported for its test.
 */
export function retryAfterMs(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
  return Number.isFinite(ms) ? Math.min(Math.max(ms, 0), MAX_RETRY_AFTER_MS) : null;
}

/**
 * `fetch` with a per-host gap, a per-request timeout, and up to `tries` attempts, backing off
 * 10 s, 20 s, 30 s… or whatever `Retry-After` asks for.
 *
 * ⚠️ ONLY AN IDEMPOTENT REQUEST IS RETRIED. A POST (the QUL sign-in) is sent exactly once: a
 * retried sign-in after a timeout can be a second login attempt the server already counted.
 */
export async function politeFetch(
  url: string,
  init: RequestInit = {},
  tries = 5
): Promise<Response> {
  const host = new URL(url).host;
  const method = (init.method ?? 'GET').toUpperCase();
  const attempts = method === 'GET' || method === 'HEAD' ? tries : 1;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const wait = (lastRequestAt.get(host) ?? 0) + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt.set(host, Date.now());
    let backoff = 10_000 * attempt;
    try {
      const response = await fetch(url, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      // A 5xx or a 429 is the upstream asking us to slow down; anything else is the answer.
      if (response.status < 500 && response.status !== 429) return response;
      lastError = new Error(`HTTP ${response.status} for ${url}`);
      backoff = retryAfterMs(response.headers.get('retry-after')) ?? backoff;
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await sleep(backoff);
  }
  throw lastError instanceof Error ? lastError : new Error(`Fetch failed for ${url}`);
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
