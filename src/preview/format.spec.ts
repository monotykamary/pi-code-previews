import assert from "node:assert/strict";
import { test } from "vitest";
import { selectPreviewTextLines, trimSingleTrailingNewline } from "./format";
import { countContentLines, countPreviewTextLines } from "./line-counts";

test("trimSingleTrailingNewline preserves leading and meaningful trailing spaces", () => {
  assert.equal(trimSingleTrailingNewline("  indented\n"), "  indented");
  assert.equal(trimSingleTrailingNewline("   \n"), "   ");
  assert.equal(trimSingleTrailingNewline("line\r\n"), "line");
  assert.equal(trimSingleTrailingNewline("line\n\n"), "line\n");
});

test("line counters preserve file and preview trailing-blank semantics", () => {
  assert.equal(countContentLines("\n\n"), 2);
  assert.equal(countContentLines("one\n"), 1);
  assert.equal(countPreviewTextLines("\n\n"), 1);
  assert.equal(countPreviewTextLines("one\n\ntwo"), 3);
});

test("content line counting preserves mixed newline semantics", () => {
  assert.equal(countContentLines(""), 0);
  assert.equal(countContentLines("one"), 1);
  assert.equal(countContentLines("\r\n\r\n"), 2);
  assert.equal(countContentLines("one\rtwo\r"), 2);
  assert.equal(countContentLines("one\r\ntwo\nthree\rfour"), 4);
});

test("text preview selection preserves head and split window behavior", () => {
  assert.deepEqual(selectPreviewTextLines("zero\none\ntwo\nthree\nfour", 3), {
    entries: [
      { kind: "line", line: "zero", index: 0 },
      { kind: "line", line: "one", index: 1 },
      { kind: "line", line: "two", index: 2 },
    ],
    shown: 3,
    hidden: 2,
    total: 5,
  });

  const twelveLines = Array.from({ length: 12 }, (_, index) => `line ${index}`).join("\n");
  assert.deepEqual(selectPreviewTextLines(twelveLines, 8), {
    entries: [
      { kind: "line", line: "line 0", index: 0 },
      { kind: "line", line: "line 1", index: 1 },
      { kind: "line", line: "line 2", index: 2 },
      { kind: "line", line: "line 3", index: 3 },
      { kind: "line", line: "line 4", index: 4 },
      { kind: "line", line: "line 5", index: 5 },
      { kind: "hidden", hidden: 5 },
      { kind: "line", line: "line 11", index: 11 },
    ],
    shown: 7,
    hidden: 5,
    total: 12,
  });
});

test("text preview selection retains all lines when unlimited or within the limit", () => {
  const expectedEntries = [
    { kind: "line" as const, line: "one", index: 0 },
    { kind: "line" as const, line: "", index: 1 },
    { kind: "line" as const, line: "two", index: 2 },
  ];
  assert.deepEqual(selectPreviewTextLines("one\n\ntwo", 3), {
    entries: expectedEntries,
    shown: 3,
    hidden: 0,
    total: 3,
  });
  assert.deepEqual(selectPreviewTextLines("one\n\ntwo", 0), {
    entries: expectedEntries,
    shown: 3,
    hidden: 0,
    total: 3,
  });
  assert.deepEqual(selectPreviewTextLines("one\n\ntwo", Number.MAX_SAFE_INTEGER), {
    entries: expectedEntries,
    shown: 3,
    hidden: 0,
    total: 3,
  });
});
