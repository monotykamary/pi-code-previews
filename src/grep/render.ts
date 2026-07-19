import type { Theme } from "@earendil-works/pi-coding-agent";
import { getLanguageFromPath } from "@earendil-works/pi-coding-agent";
import { expandPreviewTabs } from "../shared/preview-tabs";
import {
  escapeControlChars,
  getBgAnsi,
  injectVisibleRanges,
  withToolBackground,
} from "../shared/terminal-text";
import { isToolOutputNoticeLine } from "../shared/tool-output-notice";
import { resolvePreviewLanguage } from "../syntax/language";
import { renderHighlightedText } from "../syntax/shiki";

export type ParsedGrepOutputLine = {
  path: string;
  lineNumber: string;
  code: string;
  kind: "match" | "context";
};

export function renderGrepOutputLines(
  output: string,
  theme: Theme,
  search: { pattern: string; literal: boolean; ignoreCase: boolean },
  invalidate?: () => void,
  options: { syntaxHighlight?: boolean } = {},
): string[] {
  const bg = getBgAnsi(theme, "toolSuccessBg");
  const rendered: string[] = [];
  let currentPath = "";
  let currentLanguage: string | undefined;
  const syntaxHighlight = options.syntaxHighlight !== false;
  for (const rawLine of output.split("\n")) {
    if (!rawLine) {
      rendered.push(theme.fg("toolOutput", " "));
      continue;
    }
    if (isToolOutputNoticeLine(rawLine)) {
      rendered.push(theme.fg("warning", escapeControlChars(rawLine)));
      continue;
    }
    const parsed = parseGrepOutputLine(rawLine);
    if (!parsed) {
      rendered.push(theme.fg("toolOutput", escapeControlChars(rawLine)));
      continue;
    }
    if (parsed.path !== currentPath) {
      currentPath = parsed.path;
      currentLanguage = syntaxHighlight
        ? resolvePreviewLanguage({
            path: currentPath,
            piLanguage: getLanguageFromPath(currentPath),
          })
        : undefined;
      rendered.push(theme.fg("accent", escapeControlChars(currentPath)));
    }
    rendered.push(renderGrepParsedLine(parsed, currentLanguage, theme, search, invalidate));
  }
  return bg ? rendered.map((line) => withToolBackground(line, bg)) : rendered;
}

export function parseGrepOutputLine(line: string): ParsedGrepOutputLine | undefined {
  return (
    parsedGrepMatch(line.match(/^(.+):(\d+):\s(.*)$/), "match") ??
    parsedGrepMatch(line.match(/^(.+)-(\d+)-\s(.*)$/), "context")
  );
}

function parsedGrepMatch(
  match: RegExpMatchArray | null,
  kind: ParsedGrepOutputLine["kind"],
): ParsedGrepOutputLine | undefined {
  if (!match) return undefined;
  const [, path, lineNumber, code] = match;
  if (path === undefined || lineNumber === undefined || code === undefined) return undefined;
  return { path, lineNumber, code, kind };
}

function renderGrepParsedLine(
  parsed: ParsedGrepOutputLine,
  lang: string | undefined,
  theme: Theme,
  search: { pattern: string; literal: boolean; ignoreCase: boolean },
  invalidate: (() => void) | undefined,
): string {
  const code = expandPreviewTabs(parsed.code);
  let highlighted =
    renderHighlightedText(code, lang, theme, invalidate)[0] ?? theme.fg("toolOutput", code);
  const matchRanges = parsed.kind === "match" ? grepMatchRanges(code, search) : [];
  if (matchRanges.length > 0)
    highlighted = injectVisibleRanges(highlighted, matchRanges, {
      open: "\x1b[48;2;90;74;28m",
      close: getBgAnsi(theme, "toolSuccessBg") || "\x1b[49m",
      reopenAfterSgr: (sequence) => sequence === "\x1b[39m",
    });
  const paddedLineNumber = parsed.lineNumber.padStart(4);
  const lineNumber =
    parsed.kind === "match"
      ? theme.fg("accent", paddedLineNumber)
      : theme.fg("dim", paddedLineNumber);
  const marker = parsed.kind === "match" ? theme.fg("warning", "│") : theme.fg("dim", "┆");
  return `${theme.fg("dim", "  ")}${lineNumber} ${marker} ${highlighted}`;
}

function grepMatchRanges(
  code: string,
  search: { pattern: string; literal: boolean; ignoreCase: boolean },
): Array<[number, number]> {
  if (!search.pattern || !search.literal) return [];
  const haystack = search.ignoreCase ? code.toLowerCase() : code;
  const needle = search.ignoreCase ? search.pattern.toLowerCase() : search.pattern;
  const ranges: Array<[number, number]> = [];
  let index = haystack.indexOf(needle);
  while (index >= 0) {
    ranges.push([index, index + needle.length]);
    index = haystack.indexOf(needle, index + needle.length);
  }
  return ranges;
}
