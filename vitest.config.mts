import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // Same `@/*` alias tsconfig.json declares, so tests import modules by the
    // path the app uses rather than by a relative walk.
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.{test,spec}.ts"],
    exclude: ["node_modules/**", "contracts/**", ".next/**"],
  },
});
