import { evaluateWordEmphasisAccuracy } from "../src/testing/word-emphasis-accuracy";

const report = await evaluateWordEmphasisAccuracy();

console.log("Word-emphasis labeled accuracy corpus");
console.table([
  {
    target: "rendered spans",
    precision: percent(report.spans.precision),
    recall: percent(report.spans.recall),
    "F0.5": percent(report.spans.f0_5),
    "exact cases": `${report.exactSpanCases}/${report.caseCount}`,
    "over-highlight": percent(report.spans.overHighlightRatio),
  },
  {
    target: "emphasized line pairs",
    precision: percent(report.pairs.precision),
    recall: percent(report.pairs.recall),
    "F0.5": percent(report.pairs.f0_5),
    "exact cases": `${exactPairCases()}/${report.labeledPairCases}`,
    "over-highlight": "n/a",
  },
]);

const misses = report.cases.filter(
  (result) =>
    !result.exactSpans ||
    (result.pairs !== undefined &&
      (result.pairs.falsePositive > 0 || result.pairs.falseNegative > 0)),
);
if (misses.length > 0) {
  console.log("Cases with misses");
  console.table(
    misses.map((result) => ({
      case: result.name,
      "exact span lines": `${result.exactSpanLines}/${result.spanLines}`,
      "span false +": result.spans.falsePositive,
      "span false -": result.spans.falseNegative,
      "pair false +": result.pairs?.falsePositive ?? "n/a",
      "pair false -": result.pairs?.falseNegative ?? "n/a",
    })),
  );
}

function exactPairCases(): number {
  return report.cases.filter(
    (result) =>
      result.pairs !== undefined &&
      result.pairs.falsePositive === 0 &&
      result.pairs.falseNegative === 0,
  ).length;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
