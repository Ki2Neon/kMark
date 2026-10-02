import { describe, expect, test } from "vitest";

import { validateKmarkDocument } from "../../src/features/kmark-completion/core/validateKmarkDirective";
import { elapsedMilliseconds, reportPerformance } from "./support/report";

function validationDocument(pageCount: number): string {
  const page = [
    "# Page",
    "ordinary prose ".repeat(250),
    ...Array.from({ length: 5 }, () => "<!-- k use:hero -->\nordinary prose ".repeat(10)),
  ].join("\n");
  return ["<!-- k define:hero -->", ...Array.from({ length: pageCount }, () => page)].join("\n");
}

describe("Kmark validation performance (Node)", () => {
  test.each([50, 100, 200])("%i pages", (pageCount) => {
    const source = validationDocument(pageCount);
    const startedAt = performance.now();
    const warnings = validateKmarkDocument(source);
    const durationMs = elapsedMilliseconds(startedAt);
    expect(warnings).toEqual([]);
    reportPerformance("kmark-validation", "node", {
      pageCount,
      sourceLengthUtf16: source.length,
      durationMs,
    });
  });
});
