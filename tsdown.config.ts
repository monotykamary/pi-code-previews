import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "index.ts",
  format: "esm",
  fixedExtension: false,
  sourcemap: false,
  dts: true,
  deps: {
    neverBundle: [/^@earendil-works\/pi-(ai|agent-core|coding-agent|tui)(\/|$)/, /^typebox(\/|$)/],
  },
});
