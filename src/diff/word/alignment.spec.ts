import assert from "node:assert/strict";
import { test } from "vitest";
import { prefixAlignedPairs, suffixAlignedPairs } from "./alignment";

const unitScore = () => 1;
const unexpectedScore = () => {
  throw new Error("score callback should not run");
};

test("alignment preserves directional tie-breaking", () => {
  const scoreAt = unitScore;

  assert.deepEqual(suffixAlignedPairs(2, 1, scoreAt), [[0, 0]]);
  assert.deepEqual(prefixAlignedPairs(2, 1, scoreAt), [[1, 0]]);
  assert.deepEqual(suffixAlignedPairs(1, 2, scoreAt), [[0, 0]]);
  assert.deepEqual(prefixAlignedPairs(1, 2, scoreAt), [[0, 1]]);
});

test("alignment preserves score callback order", () => {
  const suffixCalls: string[] = [];
  const suffix = suffixAlignedPairs(2, 2, (beforeIndex, afterIndex) => {
    suffixCalls.push(`${beforeIndex}:${afterIndex}`);
    return beforeIndex === afterIndex ? 1 : Number.NEGATIVE_INFINITY;
  });
  const prefixCalls: string[] = [];
  const prefix = prefixAlignedPairs(2, 2, (beforeIndex, afterIndex) => {
    prefixCalls.push(`${beforeIndex}:${afterIndex}`);
    return beforeIndex === afterIndex ? 1 : Number.NEGATIVE_INFINITY;
  });

  assert.deepEqual(suffix, [
    [0, 0],
    [1, 1],
  ]);
  assert.deepEqual(suffixCalls, ["1:1", "1:0", "0:1", "0:0", "0:0", "1:1"]);
  assert.deepEqual(prefix, [
    [0, 0],
    [1, 1],
  ]);
  assert.deepEqual(prefixCalls, ["0:0", "0:1", "1:0", "1:1", "1:1", "0:0"]);
});

test("alignment skips score lookups for empty dimensions", () => {
  const scoreAt = unexpectedScore;

  assert.deepEqual(suffixAlignedPairs(0, 3, scoreAt), []);
  assert.deepEqual(prefixAlignedPairs(3, 0, scoreAt), []);
});
