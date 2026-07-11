import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { isFileNotFound } from "../shared/errors";
import { CODE_PREVIEW_SETTING_KEYS } from "./definitions";
import { defaultCodePreviewSettings } from "./defaults";
import { cloneCodePreviewSettings } from "./state";
import type { CodePreviewSettings } from "./types";
import { normalizeSettings } from "./values";

export type SettingsSaveContext = {
  baseline: CodePreviewSettings;
  loaded: CodePreviewSettings;
  globalOverrides: Record<string, unknown>;
};

let settingsSaveContext = defaultSettingsSaveContext();

export function getSettingsPath(): string {
  return join(getAgentDir(), "code-previews.json");
}

function getLegacyAgentDir(): string {
  return join(homedir(), ".pi", "agent");
}

function getLegacySettingsPath(): string {
  return join(getLegacyAgentDir(), "code-previews.json");
}

export type LoadSettingsOptions = {
  projectCwd?: string;
  projectTrusted?: boolean;
};

export async function loadSettingsFromDisk(
  options: LoadSettingsOptions = {},
): Promise<CodePreviewSettings | undefined> {
  let loaded = false;
  let effective = cloneCodePreviewSettings(defaultCodePreviewSettings);
  const settingsPath = getSettingsPath();
  const baselinePaths = [
    join(homedir(), ".pi", "settings.json"),
    join(getLegacyAgentDir(), "settings.json"),
    join(getAgentDir(), "settings.json"),
    ...(options.projectTrusted
      ? [join(options.projectCwd ?? process.cwd(), ".pi", "settings.json")]
      : []),
    getLegacySettingsPath(),
  ].filter((candidate) => candidate !== settingsPath);
  for (const candidate of new Set(baselinePaths)) {
    // Each settings layer uses the previous layer as its fallback, so precedence requires this.
    // oxlint-disable-next-line no-await-in-loop
    const next = await loadSettingsFile(candidate, effective);
    if (!next) continue;
    effective = next.settings;
    loaded = true;
  }

  const baseline = cloneCodePreviewSettings(effective);
  const globalSettings = await loadSettingsFile(settingsPath, effective);
  if (globalSettings) {
    effective = globalSettings.settings;
    loaded = true;
  }
  settingsSaveContext = {
    baseline,
    loaded: cloneCodePreviewSettings(effective),
    globalOverrides: { ...globalSettings?.data },
  };
  return loaded ? effective : undefined;
}

export function getSettingsSaveContext(): SettingsSaveContext {
  return {
    baseline: cloneCodePreviewSettings(settingsSaveContext.baseline),
    loaded: cloneCodePreviewSettings(settingsSaveContext.loaded),
    globalOverrides: { ...settingsSaveContext.globalOverrides },
  };
}

export async function saveSettingsToDisk(
  settings: CodePreviewSettings,
  context: SettingsSaveContext = defaultSettingsSaveContext(),
): Promise<void> {
  const settingsPath = getSettingsPath();
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(
    settingsPath,
    `${JSON.stringify(settingsOverrides(settings, context), null, 2)}\n`,
    "utf8",
  );
}

async function loadSettingsFile(
  settingsPath: string,
  fallback: CodePreviewSettings,
): Promise<{ data: Record<string, unknown>; settings: CodePreviewSettings } | undefined> {
  try {
    const content = await readFile(settingsPath, "utf8");
    const data = extractCodePreviewSettings(JSON.parse(content));
    return { data, settings: normalizeSettings(data, fallback) };
  } catch (error) {
    if (!isFileNotFound(error))
      console.warn(`[pi-code-previews] Failed to load settings from ${settingsPath}.`, error);
    return undefined;
  }
}

function settingsOverrides(
  settings: CodePreviewSettings,
  context: SettingsSaveContext,
): Record<string, unknown> {
  const overrides = { ...context.globalOverrides };
  for (const key of CODE_PREVIEW_SETTING_KEYS) {
    const value = settings[key];
    if (settingValuesEqual(value, context.loaded[key])) continue;
    if (settingValuesEqual(value, context.baseline[key])) delete overrides[key];
    else Object.assign(overrides, { [key]: value });
  }
  return overrides;
}

function settingValuesEqual(left: unknown, right: unknown): boolean {
  return Array.isArray(left)
    ? Array.isArray(right) &&
        left.length === right.length &&
        left.every((entry, index) => entry === right[index])
    : left === right;
}

function defaultSettingsSaveContext(): SettingsSaveContext {
  return {
    baseline: cloneCodePreviewSettings(defaultCodePreviewSettings),
    loaded: cloneCodePreviewSettings(defaultCodePreviewSettings),
    globalOverrides: {},
  };
}

export function extractCodePreviewSettings(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object") return {};
  const object = data as Record<string, unknown>;
  const nested = object.codePreview;
  if (nested && typeof nested === "object") return nested as Record<string, unknown>;
  if (hasDirectCodePreviewSettings(object)) return object;
  const extracted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(object)) {
    if (!key.startsWith("codePreview")) continue;
    const normalized = key.slice("codePreview".length);
    if (!normalized) continue;
    const first = normalized[0];
    if (first === undefined) continue;
    extracted[first.toLowerCase() + normalized.slice(1)] = value;
  }
  return extracted;
}

function hasDirectCodePreviewSettings(object: Record<string, unknown>): boolean {
  return CODE_PREVIEW_SETTING_KEYS.some((key) => key in object);
}
