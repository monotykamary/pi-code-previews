import assert from "node:assert/strict";
import { test } from "vitest";
import { getBashWarnings } from "./bash";

test("getBashWarnings returns user-facing labels", () => {
  assert.deepEqual(getBashWarnings("sudo rm -rf build"), [
    "recursive delete",
    "elevated privileges",
  ]);
  assert.deepEqual(getBashWarnings("rm -r -f build"), ["recursive delete"]);
  assert.deepEqual(getBashWarnings("rm -Rf build"), ["recursive delete"]);
  assert.deepEqual(getBashWarnings("git reset --hard && git clean -fd"), [
    "discards git changes",
    "removes untracked files",
  ]);
  assert.deepEqual(getBashWarnings("chmod -R 755 build && chown --recursive user build"), [
    "recursive permission change",
    "recursive ownership change",
  ]);
  assert.deepEqual(getBashWarnings("docker system prune --all --force"), ["removes Docker data"]);
  assert.deepEqual(getBashWarnings("printf hosts >> /etc/hosts"), ["writes to a system path"]);
  assert.deepEqual(getBashWarnings("echo hi"), []);
});
