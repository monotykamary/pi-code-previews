import type { Theme } from "@earendil-works/pi-coding-agent";
import { codePreviewSettings } from "../settings/index";
import type { DiffWordEmphasis } from "../settings/types";
import { expandPreviewTabs } from "../shared/preview-tabs";
import { escapeControlChars } from "../shared/terminal-text";
import { splitLinesLimited } from "../shared/text-lines";
import { renderWithShiki } from "../syntax/shiki";
import { collectChangedDiffBlock } from "./changed-blocks";
import { changedLineEmphasis, emphasizeChangedSpans } from "./word/line-emphasis";
import { DIFF_ADD_MARKER, DIFF_REMOVE_MARKER } from "./markers";
import {
  diffLineNumberWidth,
  formatDiffLineNumber,
  isChangedDiffLine,
  parseDiffLine,
  type ParsedDiffLine,
} from "./parse";

export function renderSyntaxHighlightedDiff(
  diff: string,
  lang: string | undefined,
  theme: Theme,
  limit: number,
  invalidate?: () => void,
): string {
  return renderDiff(diff, {
    lang,
    theme,
    limit,
    invalidate,
    syntaxHighlight: true,
    wordEmphasis: codePreviewSettings.wordEmphasis,
  });
}

export function renderPlainDiff(diff: string, theme: Theme, limit: number): string {
  return renderDiff(diff, {
    theme,
    limit,
    syntaxHighlight: false,
    wordEmphasis: "off",
  });
}

type DiffRenderOptions = {
  lang?: string;
  theme: Theme;
  limit: number;
  invalidate?: () => void;
  syntaxHighlight: boolean;
  wordEmphasis: DiffWordEmphasis;
};

function renderDiff(diff: string, options: DiffRenderOptions): string {
  const lines = splitLinesLimited(diff, options.limit);
  const parsedLines = lines.map(parseDiffLine);
  const lineNumberWidth = diffLineNumberWidth(parsedLines);
  const out: string[] = [];
  const lang = options.syntaxHighlight ? options.lang : undefined;
  const highlightedLines = lang
    ? highlightDiffLineRuns(parsedLines, lang, options.invalidate)
    : parsedLines.map(() => undefined);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const parsed = parsedLines[i];
    if (!parsed) {
      out.push(renderSeparator(line, options.theme));
      continue;
    }

    if (options.wordEmphasis !== "off" && isChangedDiffLine(parsed)) {
      const { block, end } = collectChangedDiffBlock(parsedLines, i);
      out.push(
        ...renderChangeBlock(
          block,
          highlightedLines.slice(i, end),
          options.theme,
          lineNumberWidth,
          options.wordEmphasis,
        ),
      );
      i = end - 1;
      continue;
    }

    out.push(renderDiffParsedLine(parsed, highlightedLines[i], options.theme, lineNumberWidth));
  }

  return out.join("\n");
}

function renderSeparator(line: string, theme: Theme): string {
  const safeLine = escapeControlChars(line);
  const trimmed = safeLine.trim();
  if (trimmed === "...") return theme.fg("muted", "      --- unchanged lines hidden ---");
  if (trimmed.startsWith("@@")) return theme.fg("accent", theme.bold(safeLine));
  if (trimmed.startsWith("---") || trimmed.startsWith("+++")) return theme.fg("muted", safeLine);
  if (trimmed.startsWith("diff ") || trimmed.startsWith("index "))
    return theme.fg("muted", safeLine);
  return theme.fg("toolDiffContext", safeLine);
}

function renderDiffParsedLine(
  parsed: ParsedDiffLine,
  highlighted: string | undefined,
  theme: Theme,
  lineNumberWidth: number,
): string {
  const rendered =
    highlighted ?? theme.fg("toolOutput", escapeControlChars(expandPreviewTabs(parsed.content)));
  const lineNumber = formatDiffLineNumber(parsed.lineNumber, lineNumberWidth);
  if (parsed.kind === "+")
    return `${DIFF_ADD_MARKER}${theme.fg("toolDiffAdded", `+${lineNumber} │ `)}${rendered}`;
  if (parsed.kind === "-")
    return `${DIFF_REMOVE_MARKER}${theme.fg("toolDiffRemoved", `-${lineNumber} │ `)}${rendered}`;
  return dimAnsi(
    `${theme.fg("toolDiffContext", ` ${lineNumber} │ `)}${rendered || theme.fg("toolDiffContext", "")}`,
  );
}

function renderChangeBlock(
  block: ParsedDiffLine[],
  highlightedLines: Array<string | undefined>,
  theme: Theme,
  lineNumberWidth: number,
  wordEmphasis: DiffWordEmphasis,
): string[] {
  const emphasis = changedLineEmphasis(block, wordEmphasis);
  return block.map((line, index) => {
    const rendered = renderDiffParsedLine(line, highlightedLines[index], theme, lineNumberWidth);
    const match = emphasis.get(index);
    return match ? emphasizeChangedSpans(rendered, match.ranges, match.kind) : rendered;
  });
}

function dimAnsi(text: string): string {
  return `\x1b[2m${text}\x1b[22m`;
}

function highlightDiffLineRuns(
  lines: Array<ParsedDiffLine | null>,
  lang: string,
  invalidate?: () => void,
): Array<string | undefined> {
  const highlighted: Array<string | undefined> = lines.map(() => undefined);
  let start = 0;
  while (start < lines.length) {
    const first = lines[start];
    if (!first) {
      start++;
      continue;
    }
    let end = start + 1;
    while (end < lines.length && lines[end]?.kind === first.kind) end++;
    const source = lines
      .slice(start, end)
      .map((line) => expandPreviewTabs(line?.content ?? ""))
      .join("\n");
    const rendered = renderWithShiki(source, lang, invalidate);
    if (rendered) {
      for (let index = start; index < end; index++) highlighted[index] = rendered[index - start];
    }
    start = end;
  }
  return highlighted;
}
