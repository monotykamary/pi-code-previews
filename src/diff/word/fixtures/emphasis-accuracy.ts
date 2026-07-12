import { wordEmphasisGoldenCases, type WordEmphasisGoldenCase } from "./emphasis-golden";

export type WordEmphasisAccuracyCase = WordEmphasisGoldenCase;

export const wordEmphasisAccuracyCases: WordEmphasisAccuracyCase[] = [
  ...wordEmphasisGoldenCases,
  largeReorderedBlockCase(33),
];

function largeReorderedBlockCase(count: number): WordEmphasisAccuracyCase {
  const removed = Array.from(
    { length: count },
    (_, index) => `-${index + 1} const record${index} = transform(source${index}, oldMode);`,
  );
  const added = Array.from({ length: count }, (_, position) => {
    const index = count - position - 1;
    return `+${position + 1} const record${index} = transform(source${index}, newMode);`;
  });

  return {
    name: `sparse anchors recover a reordered ${count}x${count} block`,
    diff: [...removed, ...added],
    expectedSpans: [...removed.map(() => ["old"]), ...added.map(() => ["new"])],
    expectedPairs: Array.from(
      { length: count },
      (_, index) => [index, count + (count - index - 1)] as [number, number],
    ),
  };
}
