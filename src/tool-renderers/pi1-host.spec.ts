import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import {
  VERSION,
  createAgentSession,
  createCodemodeExtension,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { registerToolRenderers } from "./registration";
import { preserveCodePreviewToolsEnv } from "./testing";
import type { CodePreviewToolName } from "../tools/names";

preserveCodePreviewToolsEnv();

test("Pi 1.0 auto-activation ownership and codemode-only declarations survive preview registration", async () => {
  assert.equal(VERSION, "1.0.0");
  const root = await mkdtemp(join(tmpdir(), "previews-pi1-"));
  // Restore a deterministic parent call through the authoritative session store.
  // No provider, credentials, or network is involved.
  const sessionManager = SessionManager.inMemory(root);
  sessionManager.appendMessage({
    role: "assistant",
    api: "offline",
    provider: "offline",
    model: "fixture",
    content: [{ type: "toolCall", id: "offline-parent", name: "codemode", arguments: {} }],
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "toolUse",
    timestamp: 0,
  });
  const settingsManager = SettingsManager.inMemory({ defaultTools: ["+codemode"] });
  const activatedTools = new Set<CodePreviewToolName>();
  const registeredTools = new Set<CodePreviewToolName>();
  process.env.CODE_PREVIEW_TOOLS = "grep";
  let disable: (() => void) | undefined;
  const loader = new DefaultResourceLoader({
    cwd: root,
    agentDir: join(root, "agent"),
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    extensionFactories: [
      createCodemodeExtension({ mode: "only" }),
      (pi) => {
        const register = () =>
          registerToolRenderers(pi, root, { activatedTools, registeredTools, toolOptions: {} });
        pi.on("session_start", register);
        disable = () => {
          process.env.CODE_PREVIEW_TOOLS = "none";
          register();
        };
      },
    ],
  });
  let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
  try {
    await writeFile(join(root, "entry.ts"), "export const migration = 100;\n");
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    ({ session } = await createAgentSession({
      cwd: root,
      agentDir: join(root, "agent"),
      settingsManager,
      resourceLoader: loader,
      sessionManager,
    }));
    await session.bindExtensions({});
    assert.ok(session.getCallableToolNames().includes("grep"));
    assert.ok(activatedTools.has("grep"));
    assert.equal(typeof session.getToolDefinition("grep")?.renderResult, "function");
    const projected = await session.agent.transformContext!([
      {
        role: "system",
        content: "probe",
        toolsAdded: session.agent.state.tools.map(({ name, description, parameters }) => ({
          name,
          description,
          parameters,
        })),
        timestamp: 0,
      },
    ]);
    assert.deepEqual(
      projected.flatMap((message) =>
        message.role === "system" ? (message.toolsAdded?.map((tool) => tool.name) ?? []) : [],
      ),
      ["codemode"],
    );
    const result = await session.extensionRunner
      .createToolContext("offline-parent", undefined)
      .executeTool("grep", { pattern: "migration", path: "entry.ts", literal: true });
    assert.equal(result.isError, false, JSON.stringify(result.result));
    assert.ok(
      result.result.content.some(
        (block) => block.type === "text" && block.text.includes("entry.ts:1:"),
      ),
    );
    assert.ok(disable);
    disable();
    assert.ok(!session.getActiveToolNames().includes("grep"));
    assert.ok(session.getActiveToolNames().includes("read"));
  } finally {
    if (session) {
      await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
      session.dispose();
    }
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
