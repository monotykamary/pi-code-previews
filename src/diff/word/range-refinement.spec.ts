import assert from "node:assert/strict";
import { test } from "vitest";
import { changedRanges, changedRangesWithConfidence } from "./emphasis";

test("token refinement preserves the identity of alignment gaps", () => {
  assert.deepEqual(
    changedRangesWithConfidence("a deletedValue b oldValue c", "a b newValue c", "all"),
    {
      removed: [
        [2, 14],
        [17, 20],
      ],
      added: [[4, 7]],
      confidence: "high",
    },
  );

  assert.deepEqual(
    changedRangesWithConfidence("a b oldValue c", "a insertedValue b newValue c", "all"),
    {
      removed: [[4, 7]],
      added: [
        [2, 15],
        [18, 21],
      ],
      confidence: "high",
    },
  );
});

test("bounded text alignment preserves meaningful internal common runs", () => {
  const before = "fooaabarbbbaz";
  const after = "fooxxbarzzbaz";
  const ranges = changedRanges(before, after, "all");

  assert.deepEqual(ranges, {
    removed: [
      [3, 5],
      [8, 10],
    ],
    added: [
      [3, 5],
      [8, 10],
    ],
  });
  assert.deepEqual(
    ranges.removed.map(([start, end]) => before.slice(start, end)),
    ["aa", "bb"],
  );
  assert.deepEqual(
    ranges.added.map(([start, end]) => after.slice(start, end)),
    ["xx", "zz"],
  );
});

test("bounded text alignment does not preserve incidental unanchored substrings", () => {
  assert.deepEqual(changedRanges("stringify", "bringHome", "all"), {
    removed: [[0, 9]],
    added: [[0, 9]],
  });
  assert.deepEqual(changedRanges("customerRecord", "mustardResult", "all"), {
    removed: [[0, 14]],
    added: [[0, 13]],
  });
});

test("text alignment falls back instead of exceeding its cell budget", () => {
  const before = `foo${"a".repeat(30)}bar${"b".repeat(30)}baz`;
  const after = `foo${"x".repeat(30)}bar${"z".repeat(30)}baz`;

  assert.deepEqual(changedRanges(before, after, "all"), {
    removed: [[3, before.length - 3]],
    added: [[3, after.length - 3]],
  });
});

test("text alignment falls back when internal common runs exceed its fragment budget", () => {
  const before = "preaaaxbbbxcccxdddxeeexfffygggpost";
  const after = "preaaazbbbzccczdddzeeeZfffZgggpost".toLowerCase();

  const ranges = changedRanges(before, after, "all");
  assert.equal(ranges.removed.length, 1);
  assert.equal(ranges.added.length, 1);
});

test("emitted ranges expand to complete extended grapheme clusters", () => {
  const cases = [
    { before: "👩‍💻Foo", after: "👩‍🔬Foo", end: 5 },
    { before: "👍🏻Foo", after: "👍🏽Foo", end: 4 },
    { before: "👨‍👩‍👧‍👦Foo", after: "👨‍👩‍👧‍👧Foo", end: 11 },
  ];

  for (const { before, after, end } of cases) {
    const ranges = changedRanges(before, after, "all");
    assert.deepEqual(ranges, { removed: [[0, end]], added: [[0, end]] });
    assertRangesUseGraphemeBoundaries(before, ranges.removed);
    assertRangesUseGraphemeBoundaries(after, ranges.added);
  }
});

function assertRangesUseGraphemeBoundaries(text: string, ranges: Array<[number, number]>): void {
  const boundaries = new Set([0, text.length]);
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  for (const segment of segmenter.segment(text)) {
    boundaries.add(segment.index);
    boundaries.add(segment.index + segment.segment.length);
  }
  for (const [start, end] of ranges) {
    assert.equal(boundaries.has(start), true, `range start ${start} splits a grapheme in ${text}`);
    assert.equal(boundaries.has(end), true, `range end ${end} splits a grapheme in ${text}`);
  }
}
