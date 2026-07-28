/**
 * Env-var loader with fail-fast validation. See api-gateway/src/lib/env.ts for docs.
 */

const isProd = process.env.NODE_ENV === "production";

function fatal(msg: string): never {
  // eslint-disable-next-line no-console
  console.error(`[env] FATAL: ${msg}`);
  process.exit(1);
}

function required(name: string): string {
  const raw = process.env[name];
  if (raw && raw.trim() !== "") return raw;
  if (isProd) fatal(`${name} is required in production but was not set`);
  fatal(`${name} is required`);
}

function optional(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw && raw.trim() !== "" ? raw : fallback;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT) || 3004,
  DATABASE_URL: required("DATABASE_URL"),
  REDIS_URL: optional("REDIS_URL", "redis://localhost:6379"),
  UPLOADS_PATH: optional("UPLOADS_PATH", "/app/uploads"),
  QUESTION_BANK_URL: optional("QUESTION_BANK_URL", "http://localhost:3001"),
};
