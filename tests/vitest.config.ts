import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["integration/**/*.test.ts"],
    // Integration tests hit a live stack — serial to avoid rate-limit collisions.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
