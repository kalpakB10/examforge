/**
 * Env-var loader with fail-fast validation.
 *
 * In production (NODE_ENV=production) any required var missing OR set to a known
 * insecure dev-default value causes the process to exit at boot. In development
 * we allow the defaults but log a loud warning so nobody deploys them by accident.
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

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT) || 3000,
  DATABASE_URL: required("DATABASE_URL"),
  JWT_SECRET: required("JWT_SECRET", "dev-only-jwt-secret-do-not-use-in-prod"),
  FRONTEND_ORIGIN: optional("FRONTEND_ORIGIN", "http://localhost:8080"),
  QUESTION_BANK_URL: optional("QUESTION_BANK_URL", "http://localhost:3001"),
  EXAM_GENERATOR_URL: optional("EXAM_GENERATOR_URL", "http://localhost:3002"),
  EXAM_SESSION_URL: optional("EXAM_SESSION_URL", "http://localhost:3003"),
  RESULT_ENGINE_URL: optional("RESULT_ENGINE_URL", "http://localhost:3004"),
  DISPUTE_MANAGER_URL: optional("DISPUTE_MANAGER_URL", "http://localhost:3005"),
};
