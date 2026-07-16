import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createCodePreviewSettingsList } from "./panels/settings";
import {
  codePreviewSettings,
  formatSettingValue,
  setCodePreviewSettings,
  updateSetting,
} from "../settings/index";
import { formatSettingsSaveError, queueSettingsSave } from "../settings/persistence";
import {
  SETTING_ITEM_DEFINITIONS,
  type SettingItemDefinition,
  type SettingsUiItemId,
} from "../settings/ui/registry";
import type { CodePreviewEditableSettingId } from "../settings/types";
import { initializeShiki } from "../syntax/shiki";

export function registerSettingsCommand(pi: ExtensionAPI): void {
  pi.registerCommand("code-preview-settings", {
    description: "Configure code preview settings",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        if (!ctx.hasUI) {
          ctx.ui.notify("/code-preview-settings requires a UI (TUI or GUI).", "error");
          return;
        }
        // Flat GUI port: the TUI panels are categorized with drill-in submenus,
        // which have no dialog equivalent. Iterate the editable settings flatly,
        // pick one, then select (enum) or input (scalar), applying via the same
        // updateSetting + save path the SettingsList uses.
        const ids = Object.keys(SETTING_ITEM_DEFINITIONS).filter(
          (id) => id !== "settingsFile" && id !== "tools",
        );
        const labels = ids.map((id) => {
          const def: SettingItemDefinition = SETTING_ITEM_DEFINITIONS[id as SettingsUiItemId];
          const current =
            id === "resetToDefaults"
              ? "keep current"
              : formatSettingValue(codePreviewSettings, id as CodePreviewEditableSettingId);
          return `${def.label}: ${current}`;
        });
        const pick = await ctx.ui.select("Code preview settings \u2014 pick a setting", labels);
        if (pick === undefined) return;
        const idx = labels.indexOf(pick);
        if (idx < 0) return;
        const id = ids[idx] as SettingsUiItemId;
        const def: SettingItemDefinition = SETTING_ITEM_DEFINITIONS[id];
        let value: string;
        if (def.values) {
          const v = await ctx.ui.select(def.label, [...def.values]);
          if (v === undefined) return;
          value = v;
        } else {
          const current = String(
            (codePreviewSettings as unknown as Record<string, unknown>)[id] ?? "",
          );
          const v = await ctx.ui.input(`New value for ${def.label}`, current);
          if (v === undefined) return;
          value = v;
        }
        const previousTheme = codePreviewSettings.shikiTheme;
        setCodePreviewSettings(updateSetting(codePreviewSettings, id, value));
        if (codePreviewSettings.shikiTheme !== previousTheme)
          void initializeShiki(codePreviewSettings.shikiTheme);
        void queueSettingsSave(codePreviewSettings).catch((error: unknown) =>
          ctx.ui.notify(formatSettingsSaveError(error), "warning"),
        );
        ctx.ui.notify(`${def.label} set to ${value}. Run /code-preview-settings for more.`, "info");
        return;
      }
      await ctx.ui.custom((_tui, theme, _kb, done) =>
        createCodePreviewSettingsList({
          notify: (message, level) => ctx.ui.notify(message, level),
          done: () => done(undefined),
          theme,
        }),
      );
    },
  });
}
