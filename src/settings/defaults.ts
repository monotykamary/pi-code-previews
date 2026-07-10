import { booleanEnv, parsePositiveInteger, positiveEnvInteger } from "../config/env";
import { ALL_CODE_PREVIEW_TOOLS } from "../tools/names";
import {
  isBundledThemeName,
  isDiffBackgroundIntensity,
  isDiffWordEmphasis,
  isPathIconMode,
} from "./definitions";
import { parseToolCallBackgroundMode } from "./tool-call-background";
import type {
  CodePreviewSettings,
  DiffBackgroundIntensity,
  DiffWordEmphasis,
  PathIconMode,
  ToolCallBackgroundMode,
} from "./types";

export const defaultCodePreviewSettings: CodePreviewSettings = {
  shikiTheme: envTheme("CODE_PREVIEW_THEME", "dark-plus"),
  diffIntensity: envDiffIntensity("CODE_PREVIEW_DIFF_INTENSITY", "subtle"),
  wordEmphasis: envDiffWordEmphasis("CODE_PREVIEW_WORD_EMPHASIS", "all"),
  toolCallBackground: envToolCallBackgroundMode("CODE_PREVIEW_TOOL_CALL_BACKGROUND", "on"),
  toolCallTiming: booleanEnv("CODE_PREVIEW_TOOL_CALL_TIMING", true),
  readCollapsedLines: positiveEnvInteger("CODE_PREVIEW_READ_LINES", 10),
  readContentPreview: booleanEnv("CODE_PREVIEW_READ_CONTENT", true),
  writeContentPreview: booleanEnv("CODE_PREVIEW_WRITE_CONTENT", true),
  writeCollapsedLines: positiveEnvInteger("CODE_PREVIEW_WRITE_LINES", 10),
  editDiffPreview: booleanEnv("CODE_PREVIEW_EDIT_DIFF", true),
  editCollapsedLines: envEditLines("CODE_PREVIEW_EDIT_LINES", 160),
  grepCollapsedLines: positiveEnvInteger("CODE_PREVIEW_GREP_LINES", 15),
  grepResultPreview: booleanEnv("CODE_PREVIEW_GREP_RESULTS", true),
  findResultPreview: booleanEnv("CODE_PREVIEW_FIND_RESULTS", true),
  lsResultPreview: booleanEnv("CODE_PREVIEW_LS_RESULTS", true),
  pathListCollapsedLines: positiveEnvInteger("CODE_PREVIEW_PATH_LIST_LINES", 20),
  readLineNumbers: booleanEnv("CODE_PREVIEW_READ_LINE_NUMBERS", true),
  bashResultPreview: booleanEnv("CODE_PREVIEW_BASH_RESULTS", true),
  bashWarnings: booleanEnv("CODE_PREVIEW_BASH_WARNINGS", true),
  syntaxHighlighting: booleanEnv("CODE_PREVIEW_SYNTAX", true),
  secretWarnings: booleanEnv("CODE_PREVIEW_SECRET_WARNINGS", true),
  pathIcons: envPathIconMode("CODE_PREVIEW_PATH_ICONS", "unicode"),
  tools: [...ALL_CODE_PREVIEW_TOOLS],
};

function envTheme(name: string, fallback: string): string {
  const value = process.env[name];
  return isBundledThemeName(value) ? value : fallback;
}

function envEditLines(name: string, fallback: number | "all"): number | "all" {
  const value = process.env[name];
  if (value === "all") return "all";
  return parsePositiveInteger(value) ?? fallback;
}

function envDiffIntensity(
  name: string,
  fallback: DiffBackgroundIntensity,
): DiffBackgroundIntensity {
  const value = process.env[name];
  return isDiffBackgroundIntensity(value) ? value : fallback;
}

function envDiffWordEmphasis(name: string, fallback: DiffWordEmphasis): DiffWordEmphasis {
  const value = process.env[name]?.toLowerCase();
  return isDiffWordEmphasis(value) ? value : fallback;
}

function envToolCallBackgroundMode(
  name: string,
  fallback: ToolCallBackgroundMode,
): ToolCallBackgroundMode {
  return parseToolCallBackgroundMode(process.env[name]) ?? fallback;
}

function envPathIconMode(name: string, fallback: PathIconMode): PathIconMode {
  const value = process.env[name]?.toLowerCase();
  return isPathIconMode(value) ? value : fallback;
}
