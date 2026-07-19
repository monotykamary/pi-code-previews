import { readFileSync } from "node:fs";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { renderSyntaxHighlightedDiff } from "../src/diff/index";
import { codePreviewSettings, setCodePreviewSettings } from "../src/settings/index";
import { renderedWordEmphasisSpans } from "../src/testing/rendered-word-emphasis";
import { wordEmphasisTelemetry } from "../src/testing/word-emphasis-telemetry";

const args = process.argv.slice(2);
const mode = args.includes("--smart") ? "smart" : "all";
const file = args.find((arg) => !arg.startsWith("--"));
const diff = (file ? readFileSync(file, "utf8") : readFileSync(0, "utf8")).replace(/\r?\n$/, "");

setCodePreviewSettings({ ...codePreviewSettings, wordEmphasis: mode });

const lineLimit = Math.max(1, diff.split(/\r?\n/).length);
const rendered = renderSyntaxHighlightedDiff(diff, undefined, plainTheme(), lineLimit).split("\n");
const spans = rendered.map(renderedWordEmphasisSpans);

console.log(
  JSON.stringify(
    {
      mode,
      spans,
      telemetry: wordEmphasisTelemetry(diff, lineLimit, mode),
    },
    null,
    2,
  ),
);

function plainTheme(): Theme {
  return {
    bold: (text: string) => text,
    fg: (_key: string, text: string) => text,
  } as Theme;
}
