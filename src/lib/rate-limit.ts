/**
 * Small fixed-window limiter, per process. Good enough to stop a single
 * client spamming invoices; put Vercel Firewall rate limiting in front for
 * production traffic.
 */
const g = globalThis as unknown as { __kodiRl?: Map<string, { n: number; reset: number }> };
const buckets = (g.__kodiRl ??= new Map());

export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  b.n += 1;
  return b.n <= max;
}

/** True while `key` has fewer than `max` recorded hits in its window. Doesn't count this call. */
export function underLimit(key: string, max: number) {
  const b = buckets.get(key);
  return !b || b.reset < Date.now() || b.n < max;
}

/** Records one hit for `key`, for limits that should only count what succeeded. */
export function recordHit(key: string, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) buckets.set(key, { n: 1, reset: now + windowMs });
  else b.n += 1;
}
