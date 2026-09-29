/** Stable, machine-readable benchmark line for CI log collection. No time limit is a pass condition. */
export function reportPerformance(
  benchmark: string,
  environment: "chromium-headless" | "node",
  measurements: Readonly<Record<string, number | string | boolean | null>>,
): void {
  console.info(`KMARK_PERF ${JSON.stringify({
    schemaVersion: 1,
    benchmark,
    environment,
    ...measurements,
  })}`);
}

export function elapsedMilliseconds(startedAt: number): number {
  return Number((performance.now() - startedAt).toFixed(3));
}

export function twoAnimationFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
