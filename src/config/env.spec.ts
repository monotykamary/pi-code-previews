import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { booleanEnv, parseBoolean } from "./env";

const originalValue = process.env.CODE_PREVIEW_TEST_BOOLEAN;

afterEach(() => {
  if (originalValue === undefined) delete process.env.CODE_PREVIEW_TEST_BOOLEAN;
  else process.env.CODE_PREVIEW_TEST_BOOLEAN = originalValue;
});

test("boolean environment values recognize explicit true and false forms", () => {
  for (const value of ["1", "true", "ON", " yes "]) assert.equal(parseBoolean(value), true);
  for (const value of ["0", "false", "OFF", " no "]) assert.equal(parseBoolean(value), false);
});

test("invalid boolean environment values preserve the configured fallback", () => {
  process.env.CODE_PREVIEW_TEST_BOOLEAN = "invalid";
  assert.equal(booleanEnv("CODE_PREVIEW_TEST_BOOLEAN", true), true);
  assert.equal(booleanEnv("CODE_PREVIEW_TEST_BOOLEAN", false), false);
});
