import { FastifyRequest, FastifyReply } from "fastify";

export function getCallerUserId(req: FastifyRequest): string | null {
  const raw = req.headers["x-user-id"];
  return typeof raw === "string" && raw.trim() !== "" ? raw : null;
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
