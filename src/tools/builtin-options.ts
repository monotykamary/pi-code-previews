import {
  getAgentDir,
  SettingsManager,
  type BashToolOptions,
  type ReadToolOptions,
} from "@earendil-works/pi-coding-agent";

export interface BuiltinToolOptions {
  bash?: BashToolOptions;
  read?: ReadToolOptions;
}

export function getBuiltinToolOptions(cwd: string, projectTrusted: boolean): BuiltinToolOptions {
  const settings = SettingsManager.create(cwd, getAgentDir(), { projectTrusted });
  return {
    bash: {
      commandPrefix: settings.getShellCommandPrefix(),
      shellPath: settings.getShellPath(),
    },
    read: {
      autoResizeImages: settings.getImageAutoResize(),
    },
  };
}
