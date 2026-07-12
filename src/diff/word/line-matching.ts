import type { WordChangeConfidence } from "./types";
import type { AddedDiffLine, RemovedDiffLine } from "../parse";
import { prefixAlignedPairs } from "./alignment";
import {
  changedLineSimilarityDocuments,
  fallbackLineSimilarity,
  hasUniqueSharedSimilarityFeature,
  similarityTokenListWeight,
  similarityTokenWeight,
  tokenSimilarity,
} from "./line-similarity";
import type { IndexedChangedLine } from "./changed-line";

export {
  changedLineTokens,
  indexedChangedLine,
  normalizedChangedContent,
  type IndexedChangedLine,
} from "./changed-line";

export type ChangedLinePair = {
  removedIndex: number;
  addedIndex: number;
  confidence: WordChangeConfidence;
};

type ChangedLinePairCandidate = {
  removedPosition: number;
  addedPosition: number;
  score: number;
};

type SparseChangedLinePairCandidate = Omit<ChangedLinePairCandidate, "score"> & {
  evidence: number;
  sharedFeatureCount: number;
  hasUniqueFeature: boolean;
  competingEvidence: number;
};

type ChangedLinePositionPair = [removedPosition: number, addedPosition: number];
type ChangedLineIndexPair = [removedIndex: number, addedIndex: number];
type ChangedLineScoreAt = (removedPosition: number, addedPosition: number) => number;

export function matchChangedLines(
  removed: Array<IndexedChangedLine<RemovedDiffLine>>,
  added: Array<IndexedChangedLine<AddedDiffLine>>,
): ChangedLinePair[] {
  if (removed.length === 0 || added.length === 0) return [];
  if (removed.length * added.length > MAX_CHANGED_LINE_PAIR_CELLS)
    return matchChangedLinesByPosition(removed, added);
  const similarityDocuments = changedLineSimilarityDocuments(removed, added);
  const tokenWeight = similarityTokenWeight(similarityDocuments);
  const { removedFeatures, addedFeatures } = similarityDocuments;
  const removedWeights = removedFeatures.map((tokens) =>
    similarityTokenListWeight(tokens, tokenWeight),
  );
  const addedWeights = addedFeatures.map((tokens) =>
    similarityTokenListWeight(tokens, tokenWeight),
  );
  const scores = removedFeatures.map((beforeTokens, removedPosition) =>
    addedFeatures.map((afterTokens, addedPosition) =>
      tokenSimilarity(
        beforeTokens,
        afterTokens,
        tokenWeight,
        MIN_POSITIONAL_FALLBACK_PAIR_SCORE,
        removedWeights[removedPosition],
        addedWeights[addedPosition],
      ),
    ),
  );
  const similarPairs = prefixAlignedPairs(
    removed.length,
    added.length,
    (removedPosition, addedPosition) => {
      const score = scores[removedPosition]?.[addedPosition] ?? 0;
      return score >= MIN_CHANGED_LINE_PAIR_SCORE ? score + 0.01 : Number.NEGATIVE_INFINITY;
    },
  );
  if (similarPairs.length === 0 && removed.length === 1 && added.length === 1)
    return [
      {
        removedIndex: changedLineAt(removed, 0).index,
        addedIndex: changedLineAt(added, 0).index,
        confidence: "medium",
      },
    ];
  const positions = changedLinePositions(removed, added);
  const confidentPairs = confidentChangedLinePairs(
    positions,
    scores,
    addPositionalFallbackPairs(removed, added, scores, similarPairs),
  );
  return addCrossingPairs(removed, added, scores, positions, confidentPairs);
}

const MIN_CHANGED_LINE_PAIR_SCORE = 0.45;
const MIN_POSITIONAL_FALLBACK_PAIR_SCORE = 0.28;
const CHANGED_LINE_PAIR_AMBIGUITY_MARGIN = 0.06;
const CHANGED_LINE_PAIR_AMBIGUITY_RATIO = 0.92;
const MIN_HIGH_CONFIDENCE_CROSSING_PAIR_SCORE = 0.72;
const HIGH_CONFIDENCE_CROSSING_PAIR_MARGIN = 0.12;
const HIGH_CONFIDENCE_CROSSING_PAIR_RATIO = 0.85;
const MAX_CHANGED_LINE_PAIR_CELLS = 1024;
const MAX_POSITIONAL_FALLBACK_AMBIGUITY_CELLS = 10_000;
const MAX_SPARSE_FEATURE_DOCUMENTS = 6;
const MAX_SPARSE_FEATURE_DOCUMENTS_PER_SIDE = 3;
const MAX_SPARSE_CANDIDATES_PER_LINE = 8;
const MIN_SPARSE_RARE_FEATURE_COUNT = 2;
const MIN_SPARSE_EVIDENCE_MARGIN = 1;
const MIN_SPARSE_EVIDENCE_RATIO = 0.9;

function matchChangedLinesByPosition(
  removed: Array<IndexedChangedLine<RemovedDiffLine>>,
  added: Array<IndexedChangedLine<AddedDiffLine>>,
): ChangedLinePair[] {
  const similarityDocuments = changedLineSimilarityDocuments(removed, added);
  const tokenWeight = similarityTokenWeight(similarityDocuments);
  const removedWeights: Array<number | undefined> = [];
  const addedWeights: Array<number | undefined> = [];
  const canCheckAmbiguity =
    removed.length * added.length <= MAX_POSITIONAL_FALLBACK_AMBIGUITY_CELLS;
  const scoreCache = canCheckAmbiguity ? new Map<number, number>() : undefined;
  const scoreAt = (removedPosition: number, addedPosition: number): number => {
    const key = removedPosition * added.length + addedPosition;
    const cached = scoreCache?.get(key);
    if (cached !== undefined) return cached;
    const removedFeatures = similarityDocuments.removedFeatures[removedPosition];
    const addedFeatures = similarityDocuments.addedFeatures[addedPosition];
    if (removedFeatures === undefined || addedFeatures === undefined)
      throw new RangeError(`Missing similarity features ${removedPosition}:${addedPosition}`);
    const removedWeight = (removedWeights[removedPosition] ??= similarityTokenListWeight(
      removedFeatures,
      tokenWeight,
    ));
    const addedWeight = (addedWeights[addedPosition] ??= similarityTokenListWeight(
      addedFeatures,
      tokenWeight,
    ));
    const score = fallbackLineSimilarity(
      changedLineAt(removed, removedPosition),
      changedLineAt(added, addedPosition),
      tokenWeight,
      removedWeight,
      addedWeight,
    );
    scoreCache?.set(key, score);
    return score;
  };

  const sparseCandidates = sparseChangedLinePairCandidates(similarityDocuments, tokenWeight);
  const pairs = sparseChangedLineAnchors(removed, added, sparseCandidates, scoreAt);
  const positions = changedLinePositions(removed, added);
  const usedRemoved = new Set<number>();
  const usedAdded = new Set<number>();
  for (const pair of pairs) {
    const removedPosition = positions.removed.get(pair.removedIndex);
    const addedPosition = positions.added.get(pair.addedIndex);
    if (removedPosition !== undefined) usedRemoved.add(removedPosition);
    if (addedPosition !== undefined) usedAdded.add(addedPosition);
  }

  for (let index = 0; index < Math.min(removed.length, added.length); index++) {
    if (usedRemoved.has(index) || usedAdded.has(index)) continue;
    const score = scoreAt(index, index);
    if (score < MIN_POSITIONAL_FALLBACK_PAIR_SCORE) continue;
    const removedLine = changedLineAt(removed, index);
    const addedLine = changedLineAt(added, index);
    if (hasUniqueSharedSimilarityFeature(removedLine, addedLine, similarityDocuments)) {
      pairs.push({
        removedIndex: removedLine.index,
        addedIndex: addedLine.index,
        confidence: linePairConfidence(score, 0),
      });
      usedRemoved.add(index);
      usedAdded.add(index);
      continue;
    }
    if (!canCheckAmbiguity) continue;

    const competingScore = competingChangedLineScoreAt(
      removed.length,
      added.length,
      index,
      index,
      scoreAt,
    );
    if (isAmbiguousChangedLinePairScore(score, competingScore)) continue;
    pairs.push({
      removedIndex: removedLine.index,
      addedIndex: addedLine.index,
      confidence: linePairConfidence(score, competingScore),
    });
    usedRemoved.add(index);
    usedAdded.add(index);
  }
  return pairs.sort(
    (a, b) =>
      (positions.removed.get(a.removedIndex) ?? 0) - (positions.removed.get(b.removedIndex) ?? 0),
  );
}

function sparseChangedLinePairCandidates(
  documents: ReturnType<typeof changedLineSimilarityDocuments>,
  tokenWeight: ReturnType<typeof similarityTokenWeight>,
): SparseChangedLinePairCandidate[] {
  const removedPositions = similarityFeaturePositions(documents.removedFeatures);
  const addedPositions = similarityFeaturePositions(documents.addedFeatures);
  const candidates = new Map<number, SparseChangedLinePairCandidate>();
  const addedLength = documents.addedFeatures.length;

  for (const [feature, featureRemovedPositions] of removedPositions) {
    const featureAddedPositions = addedPositions.get(feature);
    if (!featureAddedPositions) continue;
    const documentCount = documents.documentCounts.get(feature) ?? Number.POSITIVE_INFINITY;
    if (
      documentCount > MAX_SPARSE_FEATURE_DOCUMENTS ||
      featureRemovedPositions.length > MAX_SPARSE_FEATURE_DOCUMENTS_PER_SIDE ||
      featureAddedPositions.length > MAX_SPARSE_FEATURE_DOCUMENTS_PER_SIDE
    )
      continue;
    const weight = tokenWeight(feature);
    if (weight < 1) continue;
    const uniqueFeature =
      documentCount === 2 &&
      featureRemovedPositions.length === 1 &&
      featureAddedPositions.length === 1;

    for (const removedPosition of featureRemovedPositions) {
      for (const addedPosition of featureAddedPositions) {
        const key = removedPosition * addedLength + addedPosition;
        const candidate = candidates.get(key);
        if (candidate) {
          candidate.evidence += weight;
          candidate.sharedFeatureCount++;
          candidate.hasUniqueFeature ||= uniqueFeature;
        } else {
          candidates.set(key, {
            removedPosition,
            addedPosition,
            evidence: weight,
            sharedFeatureCount: 1,
            hasUniqueFeature: uniqueFeature,
            competingEvidence: 0,
          });
        }
      }
    }
  }

  const candidateList = [...candidates.values()];
  addCompetingSparseEvidence(candidateList);
  return boundedSparseChangedLinePairCandidates(candidateList);
}

function similarityFeaturePositions(featureLists: string[][]): Map<string, number[]> {
  const positions = new Map<string, number[]>();
  for (let position = 0; position < featureLists.length; position++) {
    const features = featureLists[position];
    if (!features) continue;
    for (const feature of new Set(features)) {
      const featurePositions = positions.get(feature);
      if (featurePositions) featurePositions.push(position);
      else positions.set(feature, [position]);
    }
  }
  return positions;
}

function addCompetingSparseEvidence(candidates: SparseChangedLinePairCandidate[]): void {
  const removedEvidence = topTwoCandidateValues(
    candidates,
    (candidate) => candidate.removedPosition,
    (candidate) => candidate.evidence,
  );
  const addedEvidence = topTwoCandidateValues(
    candidates,
    (candidate) => candidate.addedPosition,
    (candidate) => candidate.evidence,
  );
  for (const candidate of candidates) {
    candidate.competingEvidence = Math.max(
      competingCandidateValue(removedEvidence.get(candidate.removedPosition), candidate.evidence),
      competingCandidateValue(addedEvidence.get(candidate.addedPosition), candidate.evidence),
    );
  }
}

type TopTwoCandidateValues = { best: number; second: number };

function topTwoCandidateValues<T>(
  candidates: T[],
  position: (candidate: T) => number,
  value: (candidate: T) => number,
): Map<number, TopTwoCandidateValues> {
  const values = new Map<number, TopTwoCandidateValues>();
  for (const candidate of candidates) {
    const current = values.get(position(candidate)) ?? { best: 0, second: 0 };
    const candidateValue = value(candidate);
    if (candidateValue >= current.best) {
      current.second = current.best;
      current.best = candidateValue;
    } else if (candidateValue > current.second) current.second = candidateValue;
    values.set(position(candidate), current);
  }
  return values;
}

function competingCandidateValue(
  values: TopTwoCandidateValues | undefined,
  candidateValue: number,
): number {
  if (!values) return 0;
  return candidateValue === values.best ? values.second : values.best;
}

function boundedSparseChangedLinePairCandidates(
  candidates: SparseChangedLinePairCandidate[],
): SparseChangedLinePairCandidate[] {
  const byRemoved = new Map<number, SparseChangedLinePairCandidate[]>();
  const byAdded = new Map<number, SparseChangedLinePairCandidate[]>();
  for (const candidate of candidates) {
    appendSparseCandidate(byRemoved, candidate.removedPosition, candidate);
    appendSparseCandidate(byAdded, candidate.addedPosition, candidate);
  }
  const selectedByRemoved = topSparseCandidates(byRemoved);
  const selectedByAdded = topSparseCandidates(byAdded);
  return candidates.filter(
    (candidate) => selectedByRemoved.has(candidate) && selectedByAdded.has(candidate),
  );
}

function appendSparseCandidate(
  candidates: Map<number, SparseChangedLinePairCandidate[]>,
  position: number,
  candidate: SparseChangedLinePairCandidate,
): void {
  const atPosition = candidates.get(position);
  if (atPosition) atPosition.push(candidate);
  else candidates.set(position, [candidate]);
}

function topSparseCandidates(
  candidates: Map<number, SparseChangedLinePairCandidate[]>,
): Set<SparseChangedLinePairCandidate> {
  const selected = new Set<SparseChangedLinePairCandidate>();
  for (const atPosition of candidates.values()) {
    atPosition.sort(compareSparseCandidates);
    for (const candidate of atPosition.slice(0, MAX_SPARSE_CANDIDATES_PER_LINE))
      selected.add(candidate);
  }
  return selected;
}

function compareSparseCandidates(
  a: SparseChangedLinePairCandidate,
  b: SparseChangedLinePairCandidate,
): number {
  return (
    Number(b.hasUniqueFeature) - Number(a.hasUniqueFeature) ||
    b.evidence - a.evidence ||
    b.sharedFeatureCount - a.sharedFeatureCount ||
    Math.abs(a.removedPosition - a.addedPosition) - Math.abs(b.removedPosition - b.addedPosition) ||
    a.removedPosition - b.removedPosition ||
    a.addedPosition - b.addedPosition
  );
}

function sparseChangedLineAnchors(
  removed: Array<IndexedChangedLine<RemovedDiffLine>>,
  added: Array<IndexedChangedLine<AddedDiffLine>>,
  sparseCandidates: SparseChangedLinePairCandidate[],
  scoreAt: ChangedLineScoreAt,
): ChangedLinePair[] {
  const scoredCandidates = sparseCandidates
    .map((candidate) => ({
      ...candidate,
      score: scoreAt(candidate.removedPosition, candidate.addedPosition),
    }))
    .sort((a, b) => b.score - a.score || compareSparseCandidates(a, b));
  const removedScores = topTwoCandidateValues(
    scoredCandidates,
    (candidate) => candidate.removedPosition,
    (candidate) => candidate.score,
  );
  const addedScores = topTwoCandidateValues(
    scoredCandidates,
    (candidate) => candidate.addedPosition,
    (candidate) => candidate.score,
  );
  const usedRemoved = new Set<number>();
  const usedAdded = new Set<number>();
  const pairs: ChangedLinePair[] = [];

  for (const candidate of scoredCandidates) {
    if (candidate.score < MIN_HIGH_CONFIDENCE_CROSSING_PAIR_SCORE) continue;
    if (usedRemoved.has(candidate.removedPosition) || usedAdded.has(candidate.addedPosition))
      continue;
    if (!hasStrongSparseEvidence(candidate)) continue;
    const competingScore = Math.max(
      competingCandidateValue(removedScores.get(candidate.removedPosition), candidate.score),
      competingCandidateValue(addedScores.get(candidate.addedPosition), candidate.score),
      sparsePositionalCompetingScore(candidate, removed.length, added.length, scoreAt),
    );
    if (!isReciprocalBestChangedLinePair(candidate.score, competingScore)) continue;
    usedRemoved.add(candidate.removedPosition);
    usedAdded.add(candidate.addedPosition);
    pairs.push({
      removedIndex: changedLineAt(removed, candidate.removedPosition).index,
      addedIndex: changedLineAt(added, candidate.addedPosition).index,
      confidence: linePairConfidence(candidate.score, competingScore),
    });
  }
  return pairs;
}

function sparsePositionalCompetingScore(
  candidate: SparseChangedLinePairCandidate,
  removedLength: number,
  addedLength: number,
  scoreAt: ChangedLineScoreAt,
): number {
  let competingScore = 0;
  if (
    candidate.removedPosition < addedLength &&
    candidate.addedPosition !== candidate.removedPosition
  )
    competingScore = scoreAt(candidate.removedPosition, candidate.removedPosition);
  if (
    candidate.addedPosition < removedLength &&
    candidate.removedPosition !== candidate.addedPosition
  )
    competingScore = Math.max(
      competingScore,
      scoreAt(candidate.addedPosition, candidate.addedPosition),
    );
  return competingScore;
}

function hasStrongSparseEvidence(candidate: SparseChangedLinePairCandidate): boolean {
  if (!candidate.hasUniqueFeature && candidate.sharedFeatureCount < MIN_SPARSE_RARE_FEATURE_COUNT)
    return false;
  return (
    candidate.evidence - candidate.competingEvidence > MIN_SPARSE_EVIDENCE_MARGIN &&
    candidate.competingEvidence < candidate.evidence * MIN_SPARSE_EVIDENCE_RATIO
  );
}

type ChangedLinePositions = {
  removed: Map<number, number>;
  added: Map<number, number>;
};

function changedLinePositions(
  removed: Array<IndexedChangedLine<RemovedDiffLine>>,
  added: Array<IndexedChangedLine<AddedDiffLine>>,
): ChangedLinePositions {
  return {
    removed: new Map(removed.map((line, index) => [line.index, index])),
    added: new Map(added.map((line, index) => [line.index, index])),
  };
}

function confidentChangedLinePairs(
  positions: ChangedLinePositions,
  scores: number[][],
  pairs: ChangedLineIndexPair[],
): ChangedLinePair[] {
  const confidentPairs: ChangedLinePair[] = [];
  for (const [removedIndex, addedIndex] of pairs) {
    const removedPosition = positions.removed.get(removedIndex);
    const addedPosition = positions.added.get(addedIndex);
    if (removedPosition === undefined || addedPosition === undefined) continue;
    const score = scores[removedPosition]?.[addedPosition] ?? 0;
    const competingScore = competingChangedLineScore(scores, removedPosition, addedPosition);
    if (isAmbiguousChangedLinePairScore(score, competingScore)) continue;
    confidentPairs.push({
      removedIndex,
      addedIndex,
      confidence: linePairConfidence(score, competingScore),
    });
  }
  return confidentPairs;
}

function competingChangedLineScore(
  scores: number[][],
  removedPosition: number,
  addedPosition: number,
  usedRemoved?: ReadonlySet<number>,
  usedAdded?: ReadonlySet<number>,
): number {
  return competingChangedLineScoreAt(
    scores.length,
    scores[removedPosition]?.length ?? 0,
    removedPosition,
    addedPosition,
    (candidateRemovedPosition, candidateAddedPosition) =>
      scores[candidateRemovedPosition]?.[candidateAddedPosition] ?? 0,
    usedRemoved,
    usedAdded,
  );
}

function competingChangedLineScoreAt(
  removedLength: number,
  addedLength: number,
  removedPosition: number,
  addedPosition: number,
  scoreAt: ChangedLineScoreAt,
  usedRemoved?: ReadonlySet<number>,
  usedAdded?: ReadonlySet<number>,
): number {
  let competingScore = 0;
  for (
    let candidateAddedPosition = 0;
    candidateAddedPosition < addedLength;
    candidateAddedPosition++
  ) {
    if (candidateAddedPosition === addedPosition || usedAdded?.has(candidateAddedPosition))
      continue;
    competingScore = Math.max(competingScore, scoreAt(removedPosition, candidateAddedPosition));
  }
  for (
    let candidateRemovedPosition = 0;
    candidateRemovedPosition < removedLength;
    candidateRemovedPosition++
  ) {
    if (candidateRemovedPosition === removedPosition || usedRemoved?.has(candidateRemovedPosition))
      continue;
    competingScore = Math.max(competingScore, scoreAt(candidateRemovedPosition, addedPosition));
  }
  return competingScore;
}

function isAmbiguousChangedLinePairScore(score: number, competingScore: number): boolean {
  return (
    competingScore >= MIN_POSITIONAL_FALLBACK_PAIR_SCORE &&
    (score - competingScore <= CHANGED_LINE_PAIR_AMBIGUITY_MARGIN ||
      competingScore >= score * CHANGED_LINE_PAIR_AMBIGUITY_RATIO)
  );
}

function isReciprocalBestChangedLinePair(score: number, competingScore: number): boolean {
  return score > competingScore && !isAmbiguousChangedLinePairScore(score, competingScore);
}

function linePairConfidence(score: number, competingScore: number): WordChangeConfidence {
  if (
    score >= MIN_HIGH_CONFIDENCE_CROSSING_PAIR_SCORE &&
    score - competingScore >= HIGH_CONFIDENCE_CROSSING_PAIR_MARGIN &&
    competingScore <= score * HIGH_CONFIDENCE_CROSSING_PAIR_RATIO
  )
    return "high";
  return "medium";
}

function addCrossingPairs(
  removed: Array<IndexedChangedLine<RemovedDiffLine>>,
  added: Array<IndexedChangedLine<AddedDiffLine>>,
  scores: number[][],
  positions: ChangedLinePositions,
  pairs: ChangedLinePair[],
): ChangedLinePair[] {
  const usedRemoved = new Set<number>();
  const usedAdded = new Set<number>();
  for (const pair of pairs) {
    const removedPosition = positions.removed.get(pair.removedIndex);
    const addedPosition = positions.added.get(pair.addedIndex);
    if (removedPosition !== undefined) usedRemoved.add(removedPosition);
    if (addedPosition !== undefined) usedAdded.add(addedPosition);
  }

  const candidates: ChangedLinePairCandidate[] = [];
  for (let removedPosition = 0; removedPosition < removed.length; removedPosition++) {
    if (usedRemoved.has(removedPosition)) continue;
    for (let addedPosition = 0; addedPosition < added.length; addedPosition++) {
      if (usedAdded.has(addedPosition)) continue;
      const score = scores[removedPosition]?.[addedPosition] ?? 0;
      if (score >= MIN_CHANGED_LINE_PAIR_SCORE)
        candidates.push({ removedPosition, addedPosition, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const competingScores = changedLineCompetingScores(scores);

  const out = [...pairs];
  for (const candidate of candidates) {
    if (usedRemoved.has(candidate.removedPosition) || usedAdded.has(candidate.addedPosition))
      continue;
    let confidence: WordChangeConfidence | undefined;
    if (candidate.score >= MIN_HIGH_CONFIDENCE_CROSSING_PAIR_SCORE) {
      const availableCompetingScore = competingChangedLineScore(
        scores,
        candidate.removedPosition,
        candidate.addedPosition,
        usedRemoved,
        usedAdded,
      );
      if (linePairConfidence(candidate.score, availableCompetingScore) === "high")
        confidence = "high";
    }
    confidence ??= reciprocalCrossingPairConfidence(competingScores, candidate);
    if (!confidence) continue;
    usedRemoved.add(candidate.removedPosition);
    usedAdded.add(candidate.addedPosition);
    out.push({
      removedIndex: changedLineAt(removed, candidate.removedPosition).index,
      addedIndex: changedLineAt(added, candidate.addedPosition).index,
      confidence,
    });
  }

  return out.sort(
    (a, b) =>
      (positions.removed.get(a.removedIndex) ?? 0) - (positions.removed.get(b.removedIndex) ?? 0),
  );
}

type ChangedLineCompetingScores = {
  removed: TopTwoCandidateValues[];
  added: TopTwoCandidateValues[];
};

function changedLineCompetingScores(scores: number[][]): ChangedLineCompetingScores {
  const removed: TopTwoCandidateValues[] = [];
  const added: TopTwoCandidateValues[] = [];
  for (let removedPosition = 0; removedPosition < scores.length; removedPosition++) {
    const removedScores = scores[removedPosition] ?? [];
    for (let addedPosition = 0; addedPosition < removedScores.length; addedPosition++) {
      const score = removedScores[addedPosition] ?? 0;
      addCandidateValue(removed, removedPosition, score);
      addCandidateValue(added, addedPosition, score);
    }
  }
  return { removed, added };
}

function addCandidateValue(values: TopTwoCandidateValues[], position: number, value: number): void {
  const current = values[position] ?? { best: 0, second: 0 };
  if (value >= current.best) {
    current.second = current.best;
    current.best = value;
  } else if (value > current.second) current.second = value;
  values[position] = current;
}

function reciprocalCrossingPairConfidence(
  competingScores: ChangedLineCompetingScores,
  candidate: ChangedLinePairCandidate,
): WordChangeConfidence | undefined {
  const competingScore = Math.max(
    competingCandidateValue(competingScores.removed[candidate.removedPosition], candidate.score),
    competingCandidateValue(competingScores.added[candidate.addedPosition], candidate.score),
  );
  if (!isReciprocalBestChangedLinePair(candidate.score, competingScore)) return undefined;
  return linePairConfidence(candidate.score, competingScore);
}

function addPositionalFallbackPairs(
  removed: Array<IndexedChangedLine<RemovedDiffLine>>,
  added: Array<IndexedChangedLine<AddedDiffLine>>,
  scores: number[][],
  similarPairs: ChangedLinePositionPair[],
): ChangedLineIndexPair[] {
  const pairs: ChangedLineIndexPair[] = [];
  let removedCursor = 0;
  let addedCursor = 0;
  for (const [removedPosition, addedPosition] of similarPairs) {
    pairs.push(
      ...positionPairs(
        removed,
        added,
        scores,
        removedCursor,
        removedPosition,
        addedCursor,
        addedPosition,
      ),
    );
    pairs.push([
      changedLineAt(removed, removedPosition).index,
      changedLineAt(added, addedPosition).index,
    ]);
    removedCursor = removedPosition + 1;
    addedCursor = addedPosition + 1;
  }
  pairs.push(
    ...positionPairs(
      removed,
      added,
      scores,
      removedCursor,
      removed.length,
      addedCursor,
      added.length,
    ),
  );
  return pairs;
}

function positionPairs(
  removed: Array<IndexedChangedLine<RemovedDiffLine>>,
  added: Array<IndexedChangedLine<AddedDiffLine>>,
  scores: number[][],
  removedStart: number,
  removedEnd: number,
  addedStart: number,
  addedEnd: number,
): ChangedLineIndexPair[] {
  const pairs: ChangedLineIndexPair[] = [];
  const count = Math.min(removedEnd - removedStart, addedEnd - addedStart);
  for (let offset = 0; offset < count; offset++) {
    const removedPosition = removedStart + offset;
    const addedPosition = addedStart + offset;
    const score = scores[removedPosition]?.[addedPosition] ?? 0;
    if (score < MIN_POSITIONAL_FALLBACK_PAIR_SCORE) continue;
    pairs.push([
      changedLineAt(removed, removedPosition).index,
      changedLineAt(added, addedPosition).index,
    ]);
  }
  return pairs;
}

function changedLineAt<T extends AddedDiffLine | RemovedDiffLine>(
  lines: Array<IndexedChangedLine<T>>,
  index: number,
): IndexedChangedLine<T> {
  const line = lines[index];
  if (line === undefined) throw new RangeError(`Missing changed line ${index}`);
  return line;
}
