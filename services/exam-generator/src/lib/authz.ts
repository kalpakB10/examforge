import { FastifyRequest, FastifyReply } from "fastify";

/**
 * Auth helpers for downstream services. The api-gateway verifies the JWT and
 * forwards the caller's identity via `x-user-id` / `x-user-role` headers. Here
 * we trust those headers on the assumption that the gateway is the only path
 * to the service (see Phase 2 notes about sealing internal-only ports).
 */

export function getCallerUserId(req: FastifyRequest): string | null {
  const raw = req.headers["x-user-id"];
  if (typeof raw !== "string" || raw.trim() === "") return null;
  return raw;
}

export function getCallerRole(req: FastifyRequest): string | null {
  const raw = req.headers["x-user-role"];
  return typeof raw === "string" && raw.trim() !== "" ? raw : null;
}

export function requireUser(req: FastifyRequest, reply: FastifyReply): string | null {
  const userId = getCallerUserId(req);
  if (!userId) {
    reply.code(401).send({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
    return null;
  }
  return userId;
}

/**
 * 404 (not 403) on ownership mismatch — avoids leaking that the resource exists.
 * Also returns 404 when the record is missing entirely, so callers can pass the
 * result of a findUnique directly.
 */
export function requireOwnership<T extends { createdBy?: string | null } | null>(
  record: T,
  userId: string,
  reply: FastifyReply,
): record is Exclude<T, null> {
  if (!record || record.createdBy !== userId) {
    reply.code(404).send({
      success: false,
      error: { code: "NOT_FOUND", message: "Resource not found" },
    });
    return false;
  }
  return true;
}
