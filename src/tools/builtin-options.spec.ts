import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, test } from "vitest";
import { cleanupTestTempDirectories, createTestTempDirectory } from "../testing/temp-directories";
import { getBuiltinToolOptions } from "./builtin-options";

const originalPiCodingAgentDir = process.env.PI_CODING_AGENT_DIR;

afterEach(async () => {
  if (originalPiCodingAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalPiCodingAgentDir;
  await cleanupTestTempDirectories();
});

test("builtin tool options preserve Pi shell and image settings", async () => {
  const root = await createTestTempDirectory("pi-code-previews-tool-options-");
  const agentDir = join(root, "agent");
  const cwd = join(root, "project");
  process.env.PI_CODING_AGENT_DIR = agentDir;
  await mkdir(agentDir, { recursive: true });
  await mkdir(cwd, { recursive: true });
  await writeFile(
    join(agentDir, "settings.json"),
    JSON.stringify({
      shellCommandPrefix: "export PI_CODE_PREVIEW_PREFIX=ok;",
      shellPath: "/bin/sh",
      images: { autoResize: false },
    }),
    "utf8",
  );

  const options = getBuiltinToolOptions(cwd, false);
  assert.equal(options.bash?.commandPrefix, "export PI_CODE_PREVIEW_PREFIX=ok;");
  assert.equal(options.bash?.shellPath, "/bin/sh");
  assert.equal(options.read?.autoResizeImages, false);
});

test("builtin tool options ignore project settings when the project is untrusted", async () => {
  const root = await createTestTempDirectory("pi-code-previews-tool-options-trust-");
  const agentDir = join(root, "agent");
  const cwd = join(root, "project");
  process.env.PI_CODING_AGENT_DIR = agentDir;
  await mkdir(agentDir, { recursive: true });
  await mkdir(join(cwd, ".pi"), { recursive: true });
  await writeFile(
    join(agentDir, "settings.json"),
    JSON.stringify({
      shellCommandPrefix: "export PI_GLOBAL_PREFIX=ok;",
      shellPath: "/bin/sh",
      images: { autoResize: false },
    }),
    "utf8",
  );
  await writeFile(
    join(cwd, ".pi", "settings.json"),
    JSON.stringify({
      shellCommandPrefix: "malicious-project-prefix",
      shellPath: "/tmp/malicious-project-shell",
      images: { autoResize: true },
    }),
    "utf8",
  );

  const untrusted = getBuiltinToolOptions(cwd, false);
  assert.equal(untrusted.bash?.commandPrefix, "export PI_GLOBAL_PREFIX=ok;");
  assert.equal(untrusted.bash?.shellPath, "/bin/sh");
  assert.equal(untrusted.read?.autoResizeImages, false);

  const trusted = getBuiltinToolOptions(cwd, true);
  assert.equal(trusted.bash?.commandPrefix, "malicious-project-prefix");
  assert.equal(trusted.bash?.shellPath, "/tmp/malicious-project-shell");
  assert.equal(trusted.read?.autoResizeImages, true);
});
