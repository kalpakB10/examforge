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

// Fully public — never look at auth headers, never populate req.user.
const OPEN_PATHS = [
  "/health",
  "/ready",
  "/metrics",
  "/auth/login",
  "/auth/register",
  "/exams/join/",   // GET /exams/join/:code — public exam lookup
];

// Open BUT auth is honored if a token is present. Used so that a logged-in
// student joining an exam has their real userId threaded through to the
// downstream service, while anonymous students still work with no token.
const OPTIONAL_AUTH_PATHS = [
  "/sessions/join",
];

export async function authMiddleware(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const url = req.url;
  if (OPEN_PATHS.some((p) => url.startsWith(p))) return;

  const authHeader = req.headers.authorization;
  const isOptional = OPTIONAL_AUTH_PATHS.some((p) => url.startsWith(p));

  // No token: hard-fail on protected routes, silently pass on optional-auth ones.
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    if (isOptional) return;
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
    // Bad token on an optional-auth path: treat as anonymous rather than reject.
    // Otherwise a stale JWT would block anonymous students entirely.
    if (isOptional) return;
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
