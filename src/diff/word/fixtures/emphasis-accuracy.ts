import { wordEmphasisGoldenCases, type WordEmphasisGoldenCase } from "./emphasis-golden";

export type WordEmphasisAccuracyCase = WordEmphasisGoldenCase;

export const wordEmphasisAccuracyCases: WordEmphasisAccuracyCase[] = [
  ...wordEmphasisGoldenCases,
  largeReorderedBlockCase(33),
  mediumScoreReorderedBlockCase(33),
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

function mediumScoreReorderedBlockCase(count: number): WordEmphasisAccuracyCase {
  const removed = Array.from({ length: count }, (_, position) => {
    const code = profileIdentifierCode(position);
    const placement = profilePlacement(position, count);
    return `-${position + 1} const profile${code} = build${code}Profile(profile${code}Type, slot("${placement}"), rank("${placement}"), oldRecord, legacyOptions);`;
  });
  const added = Array.from({ length: count }, (_, position) => {
    const code = profileIdentifierCode(count - position - 1);
    const placement = profilePlacement(position, count);
    return `+${position + 1} const profile${code} = build${code}Profile(profile${code}Type, slot("${placement}"), rank("${placement}"), newAccount, modernSettings, metadata);`;
  });

  return {
    name: `medium-score sparse anchors recover a reordered ${count}x${count} block`,
    diff: [...removed, ...added],
    expectedSpans: [
      ...removed.map((_, position) => profileExpectedSpans(position, count, "removed")),
      ...added.map((_, position) => profileExpectedSpans(position, count, "added")),
    ],
    expectedPairs: Array.from(
      { length: count },
      (_, index) => [index, count + (count - index - 1)] as [number, number],
    ),
  };
}

function profileExpectedSpans(
  position: number,
  count: number,
  side: "added" | "removed",
): string[] {
  const spans =
    position * 2 === count - 1
      ? []
      : position * 2 < count - 1
        ? ["cold", "cold"]
        : ["warm", "warm"];
  return side === "removed"
    ? [...spans, "oldRecord", "legacyOptions"]
    : [...spans, "newAccount", "modernSettings, metadata"];
}

function profileIdentifierCode(index: number): string {
  return `${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(
    97 + (index % 26),
  )}`;
}

function profilePlacement(position: number, count: number): string {
  if (position * 2 === count - 1) return "center";
  const index = position * 2 < count - 1 ? position : count - position - 1;
  return `${position * 2 < count - 1 ? "cold" : "warm"}${profileIdentifierCode(
    index,
  ).toLowerCase()}`;
}
