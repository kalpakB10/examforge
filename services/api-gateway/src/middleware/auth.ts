import { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { env } from "../lib/env";

export interface JwtPayload {
  userId: string;
  email: string;
  role: "TEACHER" | "STUDENT";
  cohortId?: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: JwtPayload;
    requestId: string;
  }
}

const PUBLIC_PATHS = [
  "/health",
  "/ready",
  "/metrics",
  "/auth/login",
  "/auth/register",
  "/exams/join/",   // GET /exams/join/:code — public exam lookup
  "/sessions/join", // POST /sessions/join — student entry (no account)
];

export async function authMiddleware(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (PUBLIC_PATHS.some((p) => req.url.startsWith(p))) return;

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply.code(401).send({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Missing or invalid token" },
    });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = payload;
  } catch {
    return reply.code(401).send({
      success: false,
      error: { code: "TOKEN_INVALID", message: "Invalid or expired token" },
    });
  }
}

export function requireRole(role: "TEACHER" | "STUDENT") {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) {
      return reply.code(401).send({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Not authenticated" },
      });
    }
    if (req.user.role !== role) {
      return reply.code(403).send({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: `This route requires ${role} role`,
        },
      });
    }
  };
}
