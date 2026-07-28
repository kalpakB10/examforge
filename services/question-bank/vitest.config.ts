import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Unit-only phase: no DB dependency. Integration tests live under tests/.
    exclude: ["node_modules/**", "dist/**"],
  },
});
