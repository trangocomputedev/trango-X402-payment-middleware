import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "adapters/hono": "src/adapters/hono.ts",
    "adapters/next": "src/adapters/next.ts",
    "adapters/express": "src/adapters/express.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["hono", "next", "express"],
});
