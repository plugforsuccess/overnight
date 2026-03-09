/**
 * Chaos Test Utility: Run N async operations concurrently
 * Returns detailed results including timing, successes, and failures.
 */

export interface ConcurrentResult<T> {
  successes: { index: number; result: T; durationMs: number }[];
  failures: { index: number; error: string; durationMs: number }[];
  totalDurationMs: number;
  attempted: number;
}

/**
 * Run N async operations concurrently and capture all results.
 * Each operation receives its index for identification.
 */
export async function runConcurrent<T>(
  count: number,
  operation: (index: number) => Promise<T>
): Promise<ConcurrentResult<T>> {
  const startAll = Date.now();

  const promises = Array.from({ length: count }, (_, i) => {
    const start = Date.now();
    return operation(i)
      .then(result => ({
        success: true as const,
        index: i,
        result,
        durationMs: Date.now() - start,
      }))
      .catch(err => ({
        success: false as const,
        index: i,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      }));
  });

  const results = await Promise.all(promises);
  const totalDurationMs = Date.now() - startAll;

  const successes = results
    .filter((r): r is Extract<typeof r, { success: true }> => r.success)
    .map(r => ({ index: r.index, result: r.result, durationMs: r.durationMs }));

  const failures = results
    .filter((r): r is Extract<typeof r, { success: false }> => !r.success)
    .map(r => ({ index: r.index, error: r.error, durationMs: r.durationMs }));

  return { successes, failures, totalDurationMs, attempted: count };
}

/**
 * Run two different sets of operations concurrently (interleaved).
 * Useful for testing race conditions between different action types.
 */
export async function runInterleavedConcurrent<A, B>(
  opsA: Array<() => Promise<A>>,
  opsB: Array<() => Promise<B>>
): Promise<{
  resultsA: ConcurrentResult<A>;
  resultsB: ConcurrentResult<B>;
  totalDurationMs: number;
}> {
  const startAll = Date.now();

  const [resultsA, resultsB] = await Promise.all([
    runConcurrent(opsA.length, i => opsA[i]()),
    runConcurrent(opsB.length, i => opsB[i]()),
  ]);

  return {
    resultsA,
    resultsB,
    totalDurationMs: Date.now() - startAll,
  };
}
