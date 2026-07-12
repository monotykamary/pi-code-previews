import {
  mergeRanges,
  mergeRangesByStart,
  pushTokenRange,
  rangesForTokenGroup,
  type TextRange,
  type TokenGroup,
} from "./ranges";
import {
  commonPrefixLength,
  commonSuffixLength,
  needsBoundarySafeOffsets,
  rangesAtGraphemeBoundaries,
  textBoundarySegments,
  type TextBoundarySegment,
} from "./text-boundaries";
import {
  collectChangedTokenIndexes,
  type ChangedTokenGap,
  type ChangedTokenIndexes,
} from "./token-alignment";
import {
  isIdentifierSimilarityPart,
  isIdentifierToken,
  isMeaningfulOperatorToken,
  isNumberToken,
  splitIdentifierToken,
  wordEmphasisTokenWeight,
  type WordEmphasisToken,
} from "./tokens";
import type { WordChangeRanges } from "./types";
import { suffixAlignedPairs } from "./alignment";

const MAX_SOFT_TOKEN_ALIGNMENT_CELLS = 4096;
const MIN_SOFT_TOKEN_SUBSTITUTION_SIMILARITY = 0.45;
const MAX_REFINED_TEXT_ALIGNMENT_CELLS = 1024;
const MAX_REFINED_TEXT_GRAPHEMES = 48;
const MAX_REFINED_TEXT_INTERNAL_RUNS = 4;
const MIN_REFINED_TEXT_INTERNAL_RUN_GRAPHEMES = 3;

type CommonTextRun = {
  beforeStart: number;
  beforeEnd: number;
  afterStart: number;
  afterEnd: number;
};

export function refinedRangesForChangedTokens(
  beforeText: string,
  beforeTokens: WordEmphasisToken[],
  afterText: string,
  afterTokens: WordEmphasisToken[],
  gaps: ChangedTokenGap[],
): WordChangeRanges {
  const ranges = refinedRangesForTokenGaps(beforeTokens, afterTokens, gaps);
  return {
    removed: mergeRanges(rangesAtGraphemeBoundaries(beforeText, ranges.removed)),
    added: mergeRanges(rangesAtGraphemeBoundaries(afterText, ranges.added)),
  };
}

function refinedRangesForTokenGaps(
  beforeTokens: WordEmphasisToken[],
  afterTokens: WordEmphasisToken[],
  gaps: ChangedTokenGap[],
): WordChangeRanges {
  const removed: TextRange[] = [];
  const added: TextRange[] = [];

  for (const gap of gaps) {
    const removedGroup = nonEmptyTokenGroup(gap.removed);
    const addedGroup = nonEmptyTokenGroup(gap.added);
    const refined =
      removedGroup && addedGroup
        ? refinedChangedTokenGroupRanges(beforeTokens, removedGroup, afterTokens, addedGroup)
        : undefined;
    if (refined) {
      removed.push(...refined.removed);
      added.push(...refined.added);
      continue;
    }
    if (removedGroup) removed.push(...rangesForTokenGroup(beforeTokens, removedGroup));
    if (addedGroup) added.push(...rangesForTokenGroup(afterTokens, addedGroup));
  }

  return { removed: mergeRanges(removed), added: mergeRanges(added) };
}

function nonEmptyTokenGroup(group: TokenGroup): TokenGroup | undefined {
  return group.start < group.end ? group : undefined;
}

function refinedChangedTokenGroupRanges(
  beforeTokens: WordEmphasisToken[],
  beforeGroup: TokenGroup,
  afterTokens: WordEmphasisToken[],
  afterGroup: TokenGroup,
): WordChangeRanges | undefined {
  return (
    refinedSingleTokenRanges(beforeTokens, beforeGroup, afterTokens, afterGroup) ??
    refinedSoftTokenGroupRanges(beforeTokens, beforeGroup, afterTokens, afterGroup)
  );
}

function refinedSingleTokenRanges(
  beforeTokens: WordEmphasisToken[],
  beforeGroup: TokenGroup,
  afterTokens: WordEmphasisToken[],
  afterGroup: TokenGroup,
): WordChangeRanges | undefined {
  if (beforeGroup.end - beforeGroup.start !== 1 || afterGroup.end - afterGroup.start !== 1)
    return undefined;
  return refinedTokenPairRanges(
    tokenAt(beforeTokens, beforeGroup.start),
    tokenAt(afterTokens, afterGroup.start),
  );
}

function refinedTokenPairRanges(
  beforeToken: WordEmphasisToken,
  afterToken: WordEmphasisToken,
): WordChangeRanges | undefined {
  const identifierRanges = refinedIdentifierTokenRanges(beforeToken, afterToken);
  const textRanges = refinedTokenTextRanges(beforeToken, afterToken);
  if (identifierRanges && isNarrowerThanWholeTokens(identifierRanges, beforeToken, afterToken)) {
    if (shouldSuppressUnbalancedIdentifierPartRefinement(beforeToken, afterToken, textRanges))
      return textRanges;
    return identifierRanges;
  }
  return textRanges ?? identifierRanges;
}

function shouldSuppressUnbalancedIdentifierPartRefinement(
  beforeToken: WordEmphasisToken,
  afterToken: WordEmphasisToken,
  textRanges: WordChangeRanges | undefined,
): boolean {
  if (textRanges) return false;
  if (!isIdentifierToken(beforeToken.value) || !isIdentifierToken(afterToken.value)) return false;
  const beforePartCount = splitIdentifierToken(beforeToken.value, 0).filter((part) =>
    isIdentifierSimilarityPart(part.value),
  ).length;
  const afterPartCount = splitIdentifierToken(afterToken.value, 0).filter((part) =>
    isIdentifierSimilarityPart(part.value),
  ).length;
  return Math.min(beforePartCount, afterPartCount) === 1 && beforePartCount !== afterPartCount;
}

function refinedSoftTokenGroupRanges(
  beforeTokens: WordEmphasisToken[],
  beforeGroup: TokenGroup,
  afterTokens: WordEmphasisToken[],
  afterGroup: TokenGroup,
): WordChangeRanges | undefined {
  const before = beforeTokens.slice(beforeGroup.start, beforeGroup.end);
  const after = afterTokens.slice(afterGroup.start, afterGroup.end);
  if (before.length * after.length > MAX_SOFT_TOKEN_ALIGNMENT_CELLS) return undefined;
  const pairs = softAlignedTokenPairs(before, after);
  if (pairs.length === 0) return undefined;

  const pairedBefore = new Set<number>();
  const pairedAfter = new Set<number>();
  const removed: TextRange[] = [];
  const added: TextRange[] = [];

  for (const [beforeIndex, afterIndex] of pairs) {
    pairedBefore.add(beforeIndex);
    pairedAfter.add(afterIndex);
    const beforeToken = tokenAt(before, beforeIndex);
    const afterToken = tokenAt(after, afterIndex);
    if (beforeToken.value === afterToken.value) continue;
    const refined = refinedTokenPairRanges(beforeToken, afterToken);
    if (refined) {
      removed.push(...refined.removed);
      added.push(...refined.added);
    } else {
      pushTokenRange(removed, beforeToken);
      pushTokenRange(added, afterToken);
    }
  }

  for (let index = 0; index < before.length; index++) {
    if (!pairedBefore.has(index)) pushTokenRange(removed, tokenAt(before, index));
  }
  for (let index = 0; index < after.length; index++) {
    if (!pairedAfter.has(index)) pushTokenRange(added, tokenAt(after, index));
  }

  const result = { removed: mergeRangesByStart(removed), added: mergeRangesByStart(added) };
  return result.removed.length > 0 || result.added.length > 0 ? result : undefined;
}

function softAlignedTokenPairs(
  before: WordEmphasisToken[],
  after: WordEmphasisToken[],
): Array<[number, number]> {
  return suffixAlignedPairs(before.length, after.length, (beforeIndex, afterIndex) => {
    const substitution = softTokenSubstitutionWeight(
      tokenAt(before, beforeIndex),
      tokenAt(after, afterIndex),
    );
    return substitution > 0 ? substitution : Number.NEGATIVE_INFINITY;
  });
}

function softTokenSubstitutionWeight(
  beforeToken: WordEmphasisToken,
  afterToken: WordEmphasisToken,
): number {
  if (beforeToken.value === afterToken.value) return wordEmphasisTokenWeight(beforeToken.value);
  const similarity = softTokenSimilarity(beforeToken.value, afterToken.value);
  return similarity >= MIN_SOFT_TOKEN_SUBSTITUTION_SIMILARITY
    ? Math.min(
        wordEmphasisTokenWeight(beforeToken.value),
        wordEmphasisTokenWeight(afterToken.value),
      ) * similarity
    : 0;
}

function softTokenSimilarity(before: string, after: string): number {
  if (isIdentifierToken(before) && isIdentifierToken(after))
    return identifierTokenSimilarity(before, after);
  if (isNumberToken(before) && isNumberToken(after)) return edgeTextSimilarity(before, after);
  if (isMeaningfulOperatorToken(before) && isMeaningfulOperatorToken(after))
    return edgeTextSimilarity(before, after);
  return 0;
}

function identifierTokenSimilarity(before: string, after: string): number {
  const beforeParts = splitIdentifierToken(before, 0)
    .map((part) => part.value.toLowerCase())
    .filter(isIdentifierSimilarityPart);
  const afterParts = splitIdentifierToken(after, 0)
    .map((part) => part.value.toLowerCase())
    .filter(isIdentifierSimilarityPart);
  const partSimilarity = tokenDiceSimilarity(beforeParts, afterParts);
  return Math.max(partSimilarity, edgeTextSimilarity(before, after));
}

function tokenDiceSimilarity(before: string[], after: string[]): number {
  if (before.length === 0 || after.length === 0) return 0;
  const remaining = new Map<string, number>();
  for (const token of before) remaining.set(token, (remaining.get(token) ?? 0) + 1);
  let shared = 0;
  for (const token of after) {
    const count = remaining.get(token) ?? 0;
    if (count === 0) continue;
    shared++;
    if (count === 1) remaining.delete(token);
    else remaining.set(token, count - 1);
  }
  return (2 * shared) / (before.length + after.length);
}

function edgeTextSimilarity(before: string, after: string): number {
  const prefix = commonPrefixLength(before, after);
  const suffix = commonSuffixLength(before, after, prefix);
  return (2 * (prefix + suffix)) / (before.length + after.length);
}

function refinedIdentifierTokenRanges(
  beforeToken: WordEmphasisToken,
  afterToken: WordEmphasisToken,
): WordChangeRanges | undefined {
  if (!isIdentifierToken(beforeToken.value) || !isIdentifierToken(afterToken.value))
    return undefined;
  const beforeParts = splitIdentifierToken(beforeToken.value, beforeToken.start);
  const afterParts = splitIdentifierToken(afterToken.value, afterToken.start);
  if (beforeParts.length <= 1 && afterParts.length <= 1) return undefined;

  const changed: ChangedTokenIndexes = {
    removed: new Set<number>(),
    added: new Set<number>(),
    gaps: [],
  };
  collectChangedTokenIndexes(
    beforeParts,
    0,
    beforeParts.length,
    afterParts,
    0,
    afterParts.length,
    changed,
  );
  const ranges = refinedRangesForTokenGaps(beforeParts, afterParts, changed.gaps);
  return hasWordChangeRanges(ranges) ? ranges : undefined;
}

function refinedTokenTextRanges(
  beforeToken: WordEmphasisToken,
  afterToken: WordEmphasisToken,
): WordChangeRanges | undefined {
  if (beforeToken.value === afterToken.value) return undefined;
  const prefix = commonPrefixLength(beforeToken.value, afterToken.value);
  const suffix = commonSuffixLength(beforeToken.value, afterToken.value, prefix);
  if (!shouldRefineTokenText(beforeToken.value, afterToken.value, prefix, suffix)) return undefined;
  const aligned = refinedTokenTextRangesByAlignment(beforeToken, afterToken, prefix, suffix);
  if (aligned) return aligned;

  return tokenTextGapRanges(
    beforeToken,
    afterToken,
    prefix,
    beforeToken.value.length - suffix,
    prefix,
    afterToken.value.length - suffix,
  );
}

function refinedTokenTextRangesByAlignment(
  beforeToken: WordEmphasisToken,
  afterToken: WordEmphasisToken,
  prefix: number,
  suffix: number,
): WordChangeRanges | undefined {
  const beforeValue = beforeToken.value;
  const afterValue = afterToken.value;
  if (!isIdentifierToken(beforeValue) || !isIdentifierToken(afterValue)) return undefined;
  if (beforeValue.length * afterValue.length > MAX_REFINED_TEXT_ALIGNMENT_CELLS) return undefined;
  if (!hasPotentialInternalCommonText(beforeValue, afterValue, prefix, suffix)) return undefined;

  const beforeSegments = textBoundarySegments(beforeValue);
  const afterSegments = textBoundarySegments(afterValue);
  if (
    beforeSegments.length > MAX_REFINED_TEXT_GRAPHEMES ||
    afterSegments.length > MAX_REFINED_TEXT_GRAPHEMES ||
    beforeSegments.length * afterSegments.length > MAX_REFINED_TEXT_ALIGNMENT_CELLS
  )
    return undefined;

  const pairs = suffixAlignedPairs(beforeSegments.length, afterSegments.length, (before, after) =>
    segmentAt(beforeSegments, before).value === segmentAt(afterSegments, after).value
      ? 1
      : Number.NEGATIVE_INFINITY,
  );
  const runs = commonTextRuns(pairs);
  const keptRuns = runs.filter(
    (run) =>
      isEdgeTextRun(run, beforeSegments.length, afterSegments.length) ||
      run.beforeEnd - run.beforeStart >= MIN_REFINED_TEXT_INTERNAL_RUN_GRAPHEMES,
  );
  const internalRunCount = keptRuns.filter(
    (run) => !isEdgeTextRun(run, beforeSegments.length, afterSegments.length),
  ).length;
  if (internalRunCount === 0 || internalRunCount > MAX_REFINED_TEXT_INTERNAL_RUNS) return undefined;

  const removed: TextRange[] = [];
  const added: TextRange[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;
  for (const run of keptRuns) {
    pushTextSegmentRange(removed, beforeToken, beforeSegments, beforeIndex, run.beforeStart);
    pushTextSegmentRange(added, afterToken, afterSegments, afterIndex, run.afterStart);
    beforeIndex = run.beforeEnd;
    afterIndex = run.afterEnd;
  }
  pushTextSegmentRange(removed, beforeToken, beforeSegments, beforeIndex, beforeSegments.length);
  pushTextSegmentRange(added, afterToken, afterSegments, afterIndex, afterSegments.length);

  return removed.length > 0 || added.length > 0 ? { removed, added } : undefined;
}

function tokenTextGapRanges(
  beforeToken: WordEmphasisToken,
  afterToken: WordEmphasisToken,
  beforeStart: number,
  beforeEnd: number,
  afterStart: number,
  afterEnd: number,
): WordChangeRanges | undefined {
  const removed: TextRange[] =
    beforeStart < beforeEnd
      ? [[beforeToken.start + beforeStart, beforeToken.start + beforeEnd]]
      : [];
  const added: TextRange[] =
    afterStart < afterEnd ? [[afterToken.start + afterStart, afterToken.start + afterEnd]] : [];
  return removed.length > 0 || added.length > 0 ? { removed, added } : undefined;
}

function hasPotentialInternalCommonText(
  before: string,
  after: string,
  prefix: number,
  suffix: number,
): boolean {
  const beforeMiddle = before.slice(prefix, before.length - suffix);
  const afterMiddle = after.slice(prefix, after.length - suffix);
  const [shorter, longer] =
    beforeMiddle.length <= afterMiddle.length
      ? [beforeMiddle, afterMiddle]
      : [afterMiddle, beforeMiddle];
  if (shorter.length < MIN_REFINED_TEXT_INTERNAL_RUN_GRAPHEMES) return false;

  for (let index = 0; index <= shorter.length - MIN_REFINED_TEXT_INTERNAL_RUN_GRAPHEMES; index++) {
    const candidate = shorter.slice(index, index + MIN_REFINED_TEXT_INTERNAL_RUN_GRAPHEMES);
    if (longer.includes(candidate)) return true;
  }
  return false;
}

function commonTextRuns(pairs: Array<[number, number]>): CommonTextRun[] {
  const runs: CommonTextRun[] = [];
  for (const [beforeIndex, afterIndex] of pairs) {
    const previous = runs.at(-1);
    if (previous?.beforeEnd === beforeIndex && previous.afterEnd === afterIndex) {
      previous.beforeEnd++;
      previous.afterEnd++;
    } else {
      runs.push({
        beforeStart: beforeIndex,
        beforeEnd: beforeIndex + 1,
        afterStart: afterIndex,
        afterEnd: afterIndex + 1,
      });
    }
  }
  return runs;
}

function isEdgeTextRun(run: CommonTextRun, beforeLength: number, afterLength: number): boolean {
  return (
    (run.beforeStart === 0 && run.afterStart === 0) ||
    (run.beforeEnd === beforeLength && run.afterEnd === afterLength)
  );
}

function pushTextSegmentRange(
  ranges: TextRange[],
  token: WordEmphasisToken,
  segments: TextBoundarySegment[],
  start: number,
  end: number,
): void {
  if (start >= end) return;
  ranges.push([
    token.start + textSegmentOffset(segments, start, token.value.length),
    token.start + textSegmentOffset(segments, end, token.value.length),
  ]);
}

function textSegmentOffset(
  segments: TextBoundarySegment[],
  index: number,
  textLength: number,
): number {
  return index === segments.length ? textLength : segmentAt(segments, index).start;
}

function segmentAt(segments: TextBoundarySegment[], index: number): TextBoundarySegment {
  const segment = segments[index];
  if (segment === undefined) throw new RangeError(`Missing text segment ${index}`);
  return segment;
}

function shouldRefineTokenText(
  before: string,
  after: string,
  prefix: number,
  suffix: number,
): boolean {
  const sharedEdgeLength = prefix + suffix;
  if (sharedEdgeLength === 0) return false;
  if (isIdentifierToken(before) && isIdentifierToken(after)) {
    if (
      sharedEdgeLength < 2 &&
      !needsBoundarySafeOffsets(before) &&
      !needsBoundarySafeOffsets(after)
    )
      return false;
    if (prefix === 0 && suffix > 0) {
      const beforeChangedLength = before.length - suffix;
      const afterChangedLength = after.length - suffix;
      if (
        beforeChangedLength !== afterChangedLength &&
        Math.min(beforeChangedLength, afterChangedLength) < 2
      )
        return false;
    }
    return true;
  }
  if (isNumberToken(before) && isNumberToken(after)) return true;
  if (isMeaningfulOperatorToken(before) && isMeaningfulOperatorToken(after)) return true;
  return false;
}

function isNarrowerThanWholeTokens(
  ranges: WordChangeRanges,
  beforeToken: WordEmphasisToken,
  afterToken: WordEmphasisToken,
): boolean {
  return (
    ranges.removed.some((range) => range[0] > beforeToken.start || range[1] < beforeToken.end) ||
    ranges.added.some((range) => range[0] > afterToken.start || range[1] < afterToken.end) ||
    ranges.removed.length === 0 ||
    ranges.added.length === 0
  );
}

function hasWordChangeRanges(ranges: WordChangeRanges): boolean {
  return ranges.removed.length > 0 || ranges.added.length > 0;
}

function tokenAt(tokens: WordEmphasisToken[], index: number): WordEmphasisToken {
  const token = tokens[index];
  if (token === undefined) throw new RangeError(`Missing word-emphasis token ${index}`);
  return token;
}
