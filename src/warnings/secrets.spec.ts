import assert from "node:assert/strict";
import { test } from "vitest";
import { getSecretWarnings } from "./secrets";

test("getSecretWarnings detects common secret-looking values", () => {
  assert.deepEqual(getSecretWarnings("OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz"), ["API key"]);
  assert.deepEqual(getSecretWarnings('OPENAI_API_KEY="sk-abcdefghijklmnopqrstuvwxyz"'), [
    "API key",
  ]);
  assert.deepEqual(getSecretWarnings("token=ghp_abcdefghijklmnopqrstuvwxyz123456"), [
    "GitHub token",
  ]);
  assert.deepEqual(getSecretWarnings("-----BEGIN OPENSSH PRIVATE KEY-----"), ["private key"]);
  assert.deepEqual(getSecretWarnings("AWS_SECRET_ACCESS_KEY=abcdefghijklmnopqrstuvwx"), [
    "AWS secret key",
  ]);
  assert.deepEqual(getSecretWarnings("eyJabcdefghijk.abcdefghijklmnop.abcdefghijklmnop"), ["JWT"]);
  assert.deepEqual(getSecretWarnings("hello world"), []);
});
