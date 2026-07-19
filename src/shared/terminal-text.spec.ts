import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import { test } from "vitest";
import { escapeControlChars, injectVisibleRanges, wrapAnsiToWidth } from "./terminal-text";
import { stripAnsi } from "../testing/render";

test("terminal text escapes C0, DEL, and C1 control characters", () => {
  const escaped = escapeControlChars("safe\x00\x1b\x7f\x80\x9btext\t\n");

  assert.equal(escaped, "safe�␛���text\t\n");
  assert.doesNotMatch(escaped, /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/);
});

test("visible-range injection preserves SGR foreground resets", () => {
  const highlighted = injectVisibleRanges("ab\x1b[31mc\x1b[39mde", [[1, 4]], {
    open: "<open>",
    close: "<close>",
    reopenAfterSgr: (sequence) => sequence === "\x1b[39m",
  });
  assert.equal(highlighted, "a<open>b\x1b[31mc\x1b[39m<open>d<close>e");
});

test("ANSI wrapping uses terminal cell width for wide unicode", () => {
  const rows = wrapAnsiToWidth(`\x1b[31m${"漢".repeat(8)}\x1b[39m`, 6, 10);
  assert.ok(rows.length > 1);
  assert.ok(rows.every((row) => visibleWidth(row) <= 6));
  assert.equal(stripAnsi(rows[0] ?? ""), "漢漢漢");
});

test("ANSI wrapping preserves short printable spans exactly", () => {
  const text = "\x1b[31mconst value = 1;\x1b[39m";

  assert.deepEqual(wrapAnsiToWidth(text, 80), [text]);
});

test("ANSI wrapping carries active styles across rows without rewriting fitting rows", () => {
  assert.deepEqual(wrapAnsiToWidth("\x1b[31mabcdef\x1b[39m", 3, 3), [
    "\x1b[31mabc",
    "\x1b[31mdef\x1b[39m",
  ]);
});

test("ANSI wrapping still truncates an oversized continuation prefix", () => {
  assert.deepEqual(wrapAnsiToWidth("a\tb", 1, 3, "  "), ["a", "\x1b[0m", " \x1b[0m"]);
});

test("ANSI wrapping preserves styled Unicode continuation truncation", () => {
  assert.deepEqual(wrapAnsiToWidth("abcd", 3, 3, "👩\x1b[31m\u200d💻"), [
    "abc",
    "👩\x1b[31m\u200d\x1b[0m",
  ]);
});
