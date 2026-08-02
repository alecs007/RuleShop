import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@ruleshop/rule-engine": path.resolve(
        __dirname,
        "../rule-engine/src/index.ts",
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: { provider: "v8", include: ["src/**"] },
  },
});
