import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config. Assumes the stack is already running at:
 *   - Frontend: http://localhost:8080
 *   - API:      http://localhost:3000
 * `scripts/test.sh` starts the stack before invoking playwright.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // Serial: exams/students created in one test may collide with another.
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.FRONTEND_URL ?? "http://localhost:8080",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
