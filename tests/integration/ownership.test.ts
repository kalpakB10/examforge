/**
 * Integration tests for the ownership guards added in Phase 1.
 *
 * Prereq: a running stack reachable at GATEWAY_URL (default http://localhost:3000).
 * Each test provisions its own two teachers so runs don't collide.
 */

import { describe, expect, it, beforeAll } from "vitest";

const GATEWAY = process.env.GATEWAY_URL ?? "http://localhost:3000";

interface Auth { token: string; userId: string }

async function register(email: string, password: string): Promise<Auth> {
  const res = await fetch(`${GATEWAY}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name: email.split("@")[0], role: "TEACHER" }),
  });
  const body = await res.json();
  // Registration is rate-limited to 5/10min per IP — a re-run may hit this.
  if (res.status === 429) throw new Error("register rate-limit hit; wait 10min or restart api-gateway");
  if (res.status === 409) {
    // Already registered — fall through to login
    return login(email, password);
  }
  if (!res.ok) throw new Error(`register failed ${res.status}: ${JSON.stringify(body)}`);
  return { token: body.data.token, userId: body.data.user.id };
}

async function login(email: string, password: string): Promise<Auth> {
  const res = await fetch(`${GATEWAY}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`login failed ${res.status}: ${JSON.stringify(body)}`);
  return { token: body.data.token, userId: body.data.user.id };
}

async function authed(token: string, method: string, path: string, body?: any): Promise<Response> {
  // Only set Content-Type when we actually have a JSON body — Fastify rejects
  // empty bodies when the header claims application/json.
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${GATEWAY}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("ownership guards (Phase 1)", () => {
  const ts = Date.now();
  const teacherA = { email: `owntest-a-${ts}@test.example`, password: "password123" };
  const teacherB = { email: `owntest-b-${ts}@test.example`, password: "password123" };
  let authA: Auth;
  let authB: Auth;
  let classA_id: string;

  beforeAll(async () => {
    // Sanity: gateway alive
    const health = await fetch(`${GATEWAY}/health`);
    if (!health.ok) throw new Error(`gateway not reachable at ${GATEWAY}`);
    authA = await register(teacherA.email, teacherA.password);
    authB = await register(teacherB.email, teacherB.password);
    // Teacher A creates a class
    const res = await authed(authA.token, "POST", "/classes", { name: "Class Owned by A", description: "test" });
    const body = await res.json();
    if (!res.ok) throw new Error(`create class failed: ${JSON.stringify(body)}`);
    classA_id = body.data.id;
  });

  it("teacher B cannot GET teacher A's class (404, no leak)", async () => {
    const res = await authed(authB.token, "GET", `/classes/${classA_id}`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error?.code).toBe("NOT_FOUND");
  });

  it("teacher B cannot PUT teacher A's class", async () => {
    const res = await authed(authB.token, "PUT", `/classes/${classA_id}`, { name: "HACKED" });
    expect(res.status).toBe(404);
  });

  it("teacher B cannot DELETE teacher A's class", async () => {
    const res = await authed(authB.token, "DELETE", `/classes/${classA_id}`);
    expect(res.status).toBe(404);
  });

  it("teacher B's own class list is empty (no A leak)", async () => {
    const res = await authed(authB.token, "GET", "/classes");
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.data.classes.map((c: any) => c.id);
    expect(ids).not.toContain(classA_id);
  });

  it("teacher A can still access their own class (200)", async () => {
    const res = await authed(authA.token, "GET", `/classes/${classA_id}`);
    expect(res.status).toBe(200);
  });

  it("unauthenticated requests are rejected (401)", async () => {
    const res = await fetch(`${GATEWAY}/classes/${classA_id}`);
    expect(res.status).toBe(401);
  });

  it("invalid JWT is rejected (401)", async () => {
    const res = await fetch(`${GATEWAY}/classes/${classA_id}`, {
      headers: { Authorization: "Bearer garbage.token.here" },
    });
    expect(res.status).toBe(401);
  });
});

describe("auth guards", () => {
  it("login with wrong password returns 401 with structured envelope", async () => {
    const res = await fetch(`${GATEWAY}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nope@nope.example", password: "nope" }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe("INVALID_CREDENTIALS");
  });

  it("CORS preflight from allowed origin gets the header", async () => {
    const res = await fetch(`${GATEWAY}/auth/login`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:8080",
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:8080");
  });

  it("CORS preflight from disallowed origin does NOT get the header", async () => {
    const res = await fetch(`${GATEWAY}/auth/login`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://evil.example.com",
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
