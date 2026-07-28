/**
 * Env-var loader with fail-fast validation. See api-gateway/src/lib/env.ts for docs.
 */

const INSECURE_DEFAULTS = new Set([
  "supersecret",
  "supersecretjwtkey_changeinprod",
  "session_secret_changeinprod_separate",
  "changeme",
  "change_me",
  "changeinprod",
  "dev-only-jwt-secret-do-not-use-in-prod",
  "dev-only-session-secret-do-not-use-in-prod",
]);

const isProd = process.env.NODE_ENV === "production";

function fatal(msg: string): never {
  // eslint-disable-next-line no-console
  console.error(`[env] FATAL: ${msg}`);
  process.exit(1);
}

function warn(msg: string): void {
  // eslint-disable-next-line no-console
  console.warn(`[env] WARN: ${msg}`);
}

function required(name: string, devDefault?: string): string {
  const raw = process.env[name];
  if (raw && raw.trim() !== "") {
    if (isProd && INSECURE_DEFAULTS.has(raw)) {
      fatal(`${name} is set to a known insecure default in production. Rotate it.`);
    }
    return raw;
  }
  if (isProd) fatal(`${name} is required in production but was not set`);
  if (devDefault === undefined) fatal(`${name} is required (no dev default)`);
  warn(`${name} not set — using insecure dev default. DO NOT deploy this.`);
  return devDefault;
}

function optional(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw && raw.trim() !== "" ? raw : fallback;
}

const JWT_SECRET = required("JWT_SECRET", "dev-only-jwt-secret-do-not-use-in-prod");
// Session tokens SHOULD use a distinct secret in prod; falls back to JWT_SECRET in dev.
const SESSION_JWT_SECRET_RAW = process.env.SESSION_JWT_SECRET;
const isProdEnv = process.env.NODE_ENV === "production";
if (isProdEnv && (!SESSION_JWT_SECRET_RAW || INSECURE_DEFAULTS.has(SESSION_JWT_SECRET_RAW))) {
  console.error("[env] FATAL: SESSION_JWT_SECRET is required in production and must not be a known dev default");
  process.exit(1);
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT) || 3003,
  DATABASE_URL: required("DATABASE_URL"),
  JWT_SECRET,
  SESSION_JWT_SECRET: SESSION_JWT_SECRET_RAW && SESSION_JWT_SECRET_RAW.trim() !== "" ? SESSION_JWT_SECRET_RAW : JWT_SECRET,
  REDIS_URL: optional("REDIS_URL", "redis://localhost:6379"),
  EXAM_GENERATOR_URL: optional("EXAM_GENERATOR_URL", "http://localhost:3002"),
  RESULT_ENGINE_URL: optional("RESULT_ENGINE_URL", "http://localhost:3004"),
};
