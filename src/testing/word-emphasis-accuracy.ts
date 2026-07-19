import { collectChangedDiffBlock } from "../diff/changed-blocks";
import { renderSyntaxHighlightedDiff } from "../diff/index";
import { isChangedDiffLine, parseDiffLine } from "../diff/parse";
import { analyzeChangedLineBlock } from "../diff/word/change-block";
import { shouldEmphasizeChangedPair } from "../diff/word/emphasis";
import {
  wordEmphasisAccuracyCases,
  type WordEmphasisAccuracyCase,
} from "../diff/word/fixtures/emphasis-accuracy";
import { codePreviewSettings, setCodePreviewSettings } from "../settings/index";
import { initializeShiki } from "../syntax/shiki";
import { testTheme } from "./render";
import { parseRenderedWordEmphasis } from "./rendered-word-emphasis";

type AccuracyCounts = {
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
};

type PrecisionBiasedMetrics = AccuracyCounts & {
  precision: number;
  recall: number;
  f0_5: number;
};

type WordEmphasisAccuracyCaseResult = {
  name: string;
  exactSpans: boolean;
  exactSpanLines: number;
  spanLines: number;
  spans: PrecisionBiasedMetrics;
  pairs?: PrecisionBiasedMetrics;
};

type WordEmphasisAccuracyReport = {
  caseCount: number;
  exactSpanCases: number;
  exactSpanLines: number;
  spanLines: number;
  labeledPairCases: number;
  spans: PrecisionBiasedMetrics & { overHighlightRatio: number };
  pairs: PrecisionBiasedMetrics;
  cases: WordEmphasisAccuracyCaseResult[];
};

type Range = [start: number, end: number];
type LinePair = [removedLine: number, addedLine: number];

export async function evaluateWordEmphasisAccuracy(
  cases: readonly WordEmphasisAccuracyCase[] = wordEmphasisAccuracyCases,
): Promise<WordEmphasisAccuracyReport> {
  const previousSettings = { ...codePreviewSettings };
  const results: WordEmphasisAccuracyCaseResult[] = [];

  try {
    if (cases.some((accuracyCase) => accuracyCase.lang)) {
      setCodePreviewSettings({ ...previousSettings, syntaxHighlighting: true });
      await initializeShiki(previousSettings.shikiTheme);
    }
    for (const accuracyCase of cases) {
      setCodePreviewSettings({
        ...previousSettings,
        syntaxHighlighting: true,
        wordEmphasis: accuracyCase.mode ?? "all",
      });
      results.push(evaluateCase(accuracyCase));
    }
  } finally {
    setCodePreviewSettings(previousSettings);
  }

  const spanCounts = sumMetrics(results.map((result) => result.spans));
  const pairResults = results.flatMap((result) => (result.pairs ? [result.pairs] : []));
  const pairCounts = sumMetrics(pairResults);

  return {
    caseCount: results.length,
    exactSpanCases: results.filter((result) => result.exactSpans).length,
    exactSpanLines: results.reduce((total, result) => total + result.exactSpanLines, 0),
    spanLines: results.reduce((total, result) => total + result.spanLines, 0),
    labeledPairCases: pairResults.length,
    spans: {
      ...metrics(spanCounts),
      overHighlightRatio:
        spanCounts.falsePositive / Math.max(1, spanCounts.truePositive + spanCounts.falseNegative),
    },
    pairs: metrics(pairCounts),
    cases: results,
  };
}

function evaluateCase(accuracyCase: WordEmphasisAccuracyCase): WordEmphasisAccuracyCaseResult {
  const rendered = renderSyntaxHighlightedDiff(
    accuracyCase.diff.join("\n"),
    accuracyCase.lang,
    testTheme(),
    accuracyCase.diff.length,
  ).split("\n");
  if (rendered.length !== accuracyCase.expectedSpans.length)
    throw new Error(
      `${accuracyCase.name}: rendered ${rendered.length} lines, expected ${accuracyCase.expectedSpans.length}`,
    );

  const spanCounts = emptyCounts();
  let exactSpanLines = 0;
  for (let index = 0; index < rendered.length; index++) {
    const input = accuracyCase.diff[index];
    const renderedLine = rendered[index];
    const expectedSpans = accuracyCase.expectedSpans[index];
    if (input === undefined || renderedLine === undefined || expectedSpans === undefined)
      throw new RangeError(`${accuracyCase.name}: missing accuracy line ${index}`);
    const parsed = parseDiffLine(input);
    if (!parsed) throw new Error(`${accuracyCase.name}: line ${index} is not a parsed diff line`);

    const expectedRanges = rangesForExpectedSpans(
      parsed.content,
      expectedSpans,
      accuracyCase.name,
      accuracyCase.expectedRanges?.[index],
    );
    const actual = parseRenderedWordEmphasis(renderedLine);
    addRangeCounts(spanCounts, expectedRanges, actual.ranges);
    if (sameRanges(expectedRanges, actual.ranges) && actual.content === parsed.content)
      exactSpanLines++;
  }

  const pairCounts = accuracyCase.expectedPairs
    ? pairAccuracyCounts(accuracyCase, emphasizedLinePairs(accuracyCase))
    : undefined;

  return {
    name: accuracyCase.name,
    exactSpans: exactSpanLines === rendered.length,
    exactSpanLines,
    spanLines: rendered.length,
    spans: metrics(spanCounts),
    pairs: pairCounts ? metrics(pairCounts) : undefined,
  };
}

function rangesForExpectedSpans(
  content: string,
  spans: readonly string[],
  caseName: string,
  explicitRanges?: readonly Range[],
): Range[] {
  if (explicitRanges) {
    if (explicitRanges.length !== spans.length)
      throw new Error(`${caseName}: explicit ranges and expected spans differ in length`);
    for (let index = 0; index < spans.length; index++) {
      const span = spans[index];
      const range = explicitRanges[index];
      if (!span || !range || content.slice(range[0], range[1]) !== span)
        throw new Error(`${caseName}: explicit range ${index} does not match its expected span`);
    }
    return explicitRanges.map(([start, end]) => [start, end]);
  }

  const ranges: Range[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.length === 0) throw new Error(`${caseName}: expected spans cannot be empty strings`);
    const start = content.indexOf(span, cursor);
    if (start < 0)
      throw new Error(
        `${caseName}: expected span ${JSON.stringify(span)} is missing from the line`,
      );
    ranges.push([start, start + span.length]);
    cursor = start + span.length;
  }
  return ranges;
}

function emphasizedLinePairs(accuracyCase: WordEmphasisAccuracyCase): LinePair[] {
  const parsedLines = accuracyCase.diff.map(parseDiffLine);
  const pairs: LinePair[] = [];

  for (let index = 0; index < parsedLines.length; index++) {
    const parsed = parsedLines[index];
    if (!parsed || !isChangedDiffLine(parsed)) continue;
    const { block, end } = collectChangedDiffBlock(parsedLines, index);
    const analysis = analyzeChangedLineBlock(block, accuracyCase.mode ?? "all");
    for (const { pair, ranges } of analysis.ranges) {
      if (!shouldEmphasizeChangedPair(ranges, pair.confidence)) continue;
      pairs.push([index + pair.removedIndex, index + pair.addedIndex]);
    }
    index = end - 1;
  }

  return pairs;
}

function pairAccuracyCounts(
  accuracyCase: WordEmphasisAccuracyCase,
  actualPairs: readonly LinePair[],
): AccuracyCounts {
  const expected = new Set((accuracyCase.expectedPairs ?? []).map(pairKey));
  const actual = new Set(actualPairs.map(pairKey));
  let truePositive = 0;
  for (const pair of actual) if (expected.has(pair)) truePositive++;
  return {
    truePositive,
    falsePositive: actual.size - truePositive,
    falseNegative: expected.size - truePositive,
  };
}

function pairKey(pair: LinePair): string {
  return `${pair[0]}:${pair[1]}`;
}

function addRangeCounts(counts: AccuracyCounts, expected: Range[], actual: Range[]): void {
  const expectedCharacters = coveredCharacters(expected);
  const actualCharacters = coveredCharacters(actual);
  for (const character of actualCharacters) {
    if (expectedCharacters.has(character)) counts.truePositive++;
    else counts.falsePositive++;
  }
  for (const character of expectedCharacters)
    if (!actualCharacters.has(character)) counts.falseNegative++;
}

function coveredCharacters(ranges: readonly Range[]): Set<number> {
  const characters = new Set<number>();
  for (const [start, end] of ranges)
    for (let character = start; character < end; character++) characters.add(character);
  return characters;
}

function sameRanges(left: readonly Range[], right: readonly Range[]): boolean {
  return (
    left.length === right.length &&
    left.every((range, index) => range[0] === right[index]?.[0] && range[1] === right[index]?.[1])
  );
}

function sumMetrics(values: readonly AccuracyCounts[]): AccuracyCounts {
  return values.reduce(
    (total, value) => ({
      truePositive: total.truePositive + value.truePositive,
      falsePositive: total.falsePositive + value.falsePositive,
      falseNegative: total.falseNegative + value.falseNegative,
    }),
    emptyCounts(),
  );
}

function emptyCounts(): AccuracyCounts {
  return { truePositive: 0, falsePositive: 0, falseNegative: 0 };
}

function metrics(counts: AccuracyCounts): PrecisionBiasedMetrics {
  const precision = ratio(counts.truePositive, counts.truePositive + counts.falsePositive);
  const recall = ratio(counts.truePositive, counts.truePositive + counts.falseNegative);
  const betaSquared = 0.25;
  const denominator = betaSquared * precision + recall;
  return {
    ...counts,
    precision,
    recall,
    f0_5: denominator === 0 ? 0 : ((1 + betaSquared) * precision * recall) / denominator,
  };
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}
