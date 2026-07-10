import { defaultCodePreviewSettings } from "./defaults";
import { cloneCodePreviewSettings, codePreviewSettings, setCodePreviewSettings } from "./state";
import { loadSettingsFromDisk } from "./store";
import type { CodePreviewSettings } from "./types";

export async function loadCodePreviewSettings(
  projectCwd?: string,
  projectTrusted = false,
): Promise<CodePreviewSettings> {
  const savedSettings = await loadSettingsFromDisk({ projectCwd, projectTrusted });
  setCodePreviewSettings(savedSettings ?? defaultCodePreviewSettings);
  return cloneCodePreviewSettings(codePreviewSettings);
}
