import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Garda `server-only` ar arunca in mediul de test — devine no-op.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
      "@": path.resolve(__dirname, "."),
      // Workspace packages resolve straight from source, with no build step
      // intre o modificare in motor si testele care o folosesc.
      "@ruleshop/rule-engine": path.resolve(
        __dirname,
        "../../packages/rule-engine/src/index.ts",
      ),
      "@ruleshop/rate-limit": path.resolve(
        __dirname,
        "../../packages/rate-limit/src/index.ts",
      ),
      "@ruleshop/storefront": path.resolve(
        __dirname,
        "../../packages/storefront/src/index.ts",
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["lib/**", "app/api/**"],
    },
  },
});
