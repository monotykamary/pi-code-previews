import assert from "node:assert/strict";
import { test } from "vitest";
import { evaluateWordEmphasisAccuracy } from "../../testing/word-emphasis-accuracy";
import { wordEmphasisAccuracyCases } from "./fixtures/emphasis-accuracy";

test("labeled word-emphasis corpus preserves exact spans and line pairs", async () => {
  const report = await evaluateWordEmphasisAccuracy();

  assert.equal(report.caseCount, wordEmphasisAccuracyCases.length);
  assert.equal(report.exactSpanCases, report.caseCount, "exact rendered-span cases");
  assert.equal(report.exactSpanLines, report.spanLines, "exact rendered-span lines");
  assert.equal(report.spans.falsePositive, 0, "over-highlighted characters");
  assert.equal(report.spans.falseNegative, 0, "missed highlight characters");
  assert.equal(report.spans.precision, 1, "span precision");
  assert.equal(report.spans.recall, 1, "span recall");
  assert.equal(report.spans.f0_5, 1, "span F0.5");
  assert.equal(report.spans.overHighlightRatio, 0, "over-highlight ratio");
  assert.equal(report.pairs.falsePositive, 0, "incorrect emphasized line pairs");
  assert.equal(report.pairs.falseNegative, 0, "missed emphasized line pairs");
  assert.equal(report.pairs.precision, 1, "line-pair precision");
  assert.equal(report.pairs.recall, 1, "line-pair recall");
  assert.equal(report.pairs.f0_5, 1, "line-pair F0.5");
});
