import assert from "node:assert/strict";
import { test } from "vitest";
import { parseRenderedWordEmphasis, renderedWordEmphasisSpans } from "./rendered-word-emphasis";

test("rendered word emphasis handles light themes and SGR reopens", () => {
  const line = "+1 │ a\x1b[48;2;194;209;194mb\x1b[39m\x1b[48;2;194;209;194mc\x1b[49md";

  assert.deepEqual(parseRenderedWordEmphasis(line), {
    content: "abcd",
    ranges: [[1, 3]],
  });
  assert.deepEqual(renderedWordEmphasisSpans(line), ["bc"]);
});

test("rendered word emphasis rejects unterminated ranges", () => {
  assert.throws(
    () => parseRenderedWordEmphasis("+1 │ value \x1b[48;2;148;62;70mold"),
    /Unterminated word emphasis/,
  );
});
