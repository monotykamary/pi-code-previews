import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createLsToolDefinition } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

import { renderDisplayPath } from "../paths/display";
import { codePreviewSettings } from "../settings/index";
import { registerPathListTool } from "./shared/path-list-tool";

export function registerLs(pi: ExtensionAPI, cwd: string) {
  registerPathListTool(pi, cwd, {
    createToolDefinition: createLsToolDefinition,
    renderCall(args, theme, renderCwd) {
      const path = typeof args.path === "string" && args.path ? args.path : ".";
      return new Text(
        `${theme.fg("toolTitle", theme.bold("ls"))} ${renderDisplayPath(path, renderCwd, theme)}`,
        0,
        0,
      );
    },
    resultConfig: (renderCwd) => ({
      cwd: renderCwd,
      iconMode: codePreviewSettings.pathIcons,
      previewEnabled: codePreviewSettings.lsResultPreview,
      collapsedLines: codePreviewSettings.pathListCollapsedLines,
      loadingLabel: "Listing…",
      errorLabel: "List failed",
      emptyMarker: "(empty directory)",
      emptyLabel: () => "Empty directory",
      footerNoun: "entries",
    }),
  });
}
