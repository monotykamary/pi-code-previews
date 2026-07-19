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
  assert.deepEqual(getBashWarnings("find /"), ["searches entire filesystem"]);
  assert.deepEqual(getBashWarnings("find / -name foo"), ["searches entire filesystem"]);
  assert.deepEqual(getBashWarnings("find -L /"), ["searches entire filesystem"]);
  assert.deepEqual(getBashWarnings("find ~"), ["searches entire home directory"]);
  assert.deepEqual(getBashWarnings("find ~/ -name foo"), ["searches entire home directory"]);
  assert.deepEqual(getBashWarnings("find /home"), []);
  assert.deepEqual(getBashWarnings("find ~/src"), []);
  assert.deepEqual(getBashWarnings("chmod -R 755 build && chown --recursive user build"), [
    "recursive permission change",
    "recursive ownership change",
  ]);
  assert.deepEqual(getBashWarnings("docker system prune --all --force"), ["removes Docker data"]);
  assert.deepEqual(getBashWarnings("printf hosts >> /etc/hosts"), ["writes to a system path"]);
  assert.deepEqual(getBashWarnings("echo hi"), []);
});
