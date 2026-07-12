import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "vitest";
import { renderSyntaxHighlightedDiff } from "../index";
import { codePreviewSettings, setCodePreviewSettings } from "../../settings/index";
import { testTheme } from "../../testing/render";
import { renderedWordEmphasisSpans } from "../../testing/rendered-word-emphasis";
import { wordEmphasisGoldenCases } from "./fixtures/emphasis-golden";

let previousCodePreviewSettings = { ...codePreviewSettings };

beforeEach(() => {
  previousCodePreviewSettings = { ...codePreviewSettings };
});

afterEach(() => {
  setCodePreviewSettings(previousCodePreviewSettings);
});

test("word emphasis golden cases match the curated corpus", () => {
  for (const goldenCase of wordEmphasisGoldenCases) {
    setCodePreviewSettings({
      ...codePreviewSettings,
      wordEmphasis: goldenCase.mode ?? "all",
    });
    const rendered = renderSyntaxHighlightedDiff(
      goldenCase.diff.join("\n"),
      undefined,
      testTheme(),
      goldenCase.diff.length,
    ).split("\n");
    assert.equal(
      rendered.length,
      goldenCase.expectedSpans.length,
      `${goldenCase.name}: rendered line count`,
    );
    assert.deepEqual(
      rendered.map(renderedWordEmphasisSpans),
      goldenCase.expectedSpans,
      `${goldenCase.name}: emphasized spans`,
    );
  }
});
