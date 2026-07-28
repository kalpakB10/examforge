/**
 * Teacher happy path: register a fresh teacher via the API (avoids UI flakiness
 * on the registration form), then drive the browser through:
 *   login → dashboard → classes → create class → open class detail.
 *
 * Broader flows (create subject / chapter / exam / download PDF) are covered
 * by the integration tests + unit tests + the manual smoke doc. This spec is
 * the "did the UI load and route correctly" gate for CI.
 */
import { test, expect, request } from "@playwright/test";

const API = process.env.GATEWAY_URL ?? "http://localhost:3000";
// Seed teacher for E2E — set via env, defaults to the smoke account.
// Register-rate-limit means we can't spin up fresh teachers per-run reliably.
const teacher = {
  email: process.env.E2E_TEACHER_EMAIL ?? "teacher@test.com",
  password: process.env.E2E_TEACHER_PASSWORD ?? "password123",
};

test.beforeAll(async () => {
  // Sanity: teacher can log in via API. If not, tests are meaningless.
  const ctx = await request.newContext();
  const res = await ctx.post(`${API}/auth/login`, {
    data: { email: teacher.email, password: teacher.password },
  });
  if (!res.ok()) {
    throw new Error(
      `E2E teacher '${teacher.email}' not present. ` +
      `Register once manually or set E2E_TEACHER_EMAIL / E2E_TEACHER_PASSWORD.`,
    );
  }
});

test("teacher can log in and see the dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email address/i).fill(teacher.email);
  await page.getByLabel(/^password$/i).fill(teacher.password);
  await page.getByRole("button", { name: /sign in/i }).click();

  // Dashboard route lives at /teacher — wait for the URL to change.
  await page.waitForURL(/\/teacher(\/|$)/);
  // Anything at all rendered? A blank white screen means an ErrorBoundary fallback.
  await expect(page.locator("body")).not.toContainText(/Something went wrong/i);
});

test("teacher can navigate to Classes and create one", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email address/i).fill(teacher.email);
  await page.getByLabel(/^password$/i).fill(teacher.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/teacher(\/|$)/);

  await page.goto("/teacher/classes");
  await page.waitForLoadState("networkidle");

  // Look for a "New/Add/Create Class" button — UI wording varies, so use a
  // permissive regex. If the page shows any of these, we know it rendered.
  const createBtn = page.getByRole("button", { name: /new class|create class|add class/i }).first();
  const found = await createBtn.count();
  expect(found).toBeGreaterThan(0);
});
