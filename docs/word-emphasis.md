# Word emphasis

Word emphasis is the stronger inline highlighting used inside added/removed diff lines. It is a visual review aid: it tries to show the changed words, tokens, or token parts after the normal line-level diff has already decided which lines changed.

## Settings

Word emphasis is controlled by `wordEmphasis` / `CODE_PREVIEW_WORD_EMPHASIS`:

- `all` — show all accepted word-emphasis spans.
- `smart` — suppress low-signal noise, such as wrapper-only syntax changes, while keeping meaningful token/operator changes.
- `off` — disable inline word emphasis.

## How it works

Word emphasis has two stages.

### 1. Pair changed lines

Inside each contiguous changed block, removed and added lines are paired before ranges are computed. Pairing uses lexical similarity rather than position alone:

- weighted tokens, so identifiers/numbers/operators matter more than punctuation
- rarity weighting within the changed block
- compound-identifier subtokens, e.g. `readCollapsedLines` -> `read`, `Collapsed`, `Lines`
- token bigrams for local ordering evidence
- high-confidence crossing matches for reordered lines
- reciprocal-best medium-confidence matches when a reordered pair is clearly dominant
- bounded rare-feature anchors for reordered or shifted large blocks
- ambiguity detection that skips uncertain pairings instead of guessing

### 2. Find changed spans inside paired lines

For each paired line, changed spans are computed over normalized rendered text so tabs and escaped control characters stay aligned with the TUI output. Span detection uses:

- weighted token LCS for exact alignment
- alignment-gap-aware refinement, so insertions and replacements are not compared across unrelated gaps
- compound identifier refinement
- single-token text refinement, e.g. `value1000` -> `value1001`
- bounded grapheme alignment for meaningful shared text inside short tokens
- soft token substitution alignment for similar identifiers/numbers/operators
- extended-grapheme-safe ranges for emoji and combining sequences
- smart filtering for low-signal syntax noise

## Confidence model

Word emphasis tracks confidence separately for line pairing and token-range alignment:

- `high` — exact or strongly dominant match
- `medium` — anchored/fallback match that is plausible but less certain
- `low` — broad fallback or suppressed output

Rendering is conservative: low-confidence ranges are skipped unless the line pair itself is high-confidence. This favors missing an emphasis over showing a misleading one.

## Inspect emphasized spans

From a source checkout, use the span inspector when adding examples or investigating surprising
output. Benchmark sources and golden fixtures are not included in the published npm package.

```bash
npm run word:spans -- path/to/diff.txt
```

Or pipe a diff through stdin:

```bash
pbpaste | npm run word:spans -- --smart
```

The output includes the emphasized spans per rendered diff line and telemetry such as pair confidence, range confidence, emphasized pairs, and skipped pairs.

## Golden corpus

Word-emphasis accuracy is guarded by a golden corpus in:

```text
src/diff/word/fixtures/emphasis-golden.ts
```

The test runner renders each diff and compares the extracted emphasized spans:

```text
src/diff/word/emphasis-golden.spec.ts
```

When real diffs reveal a miss, add the smallest representative case to the corpus. Prefer real examples over synthetic threshold tuning.

The labeled corpus also records expected changed-line pairs for pairing-sensitive cases. Run the
precision-biased accuracy report with:

```bash
npm run word:accuracy
```

It reports pair and character-span precision, recall, F0.5, exact cases, and the over-highlight
ratio. The test suite requires the labeled corpus to remain exact; add new cases before tuning
similarity or ambiguity thresholds.

## Telemetry in benchmarks

`npm run bench:word-pathology` prints both performance and confidence summaries. It includes the
32x32/33x33 full-matrix boundary, large sparse reordered and shifted blocks, internal-token
refinement, and extended grapheme refinement. Use it before changing thresholds or tokenization so
accuracy improvements do not accidentally increase skipped pairs or pathological render time.

## Current limitations

Word emphasis is lexical, not AST-semantic. It can still skip or choose broad spans for large semantic refactors, highly repetitive generated code, or cases where the “correct” emphasis is subjective. The intended behavior is to be useful and trustworthy, not exhaustive.
