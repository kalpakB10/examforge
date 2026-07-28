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
 * Records where ownership is expressed via a different column can pass the
 * expected owner id via `ownerColumn` (default: `createdBy`).
 */
export function requireOwnership<T extends Record<string, any> | null>(
  record: T,
  userId: string,
  reply: FastifyReply,
  ownerColumn: string = "createdBy",
): record is Exclude<T, null> {
  if (!record || record[ownerColumn] !== userId) {
    reply.code(404).send({
      success: false,
      error: { code: "NOT_FOUND", message: "Resource not found" },
    });
    return false;
  }
  return true;
}

/**
 * Transitive-ownership check for records that inherit ownership from an ancestor
 * (e.g. Subject → Class.createdBy, Chapter → Subject → Class.createdBy).
 * Sends 404 and returns false on any mismatch. Returns true on success.
 *
 * Subjects/chapters with no owning class (classId=null) are treated as unowned
 * and thus not editable by anyone — this is intentional for pre-existing orphan
 * rows; new records should always be tied to a class.
 */
import { PrismaClient } from "@prisma/client";

export async function assertOwnsSubject(
  prisma: PrismaClient,
  subjectId: string,
  userId: string,
  reply: FastifyReply,
): Promise<boolean> {
  const s = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { class: { select: { createdBy: true } } },
  });
  if (!s || !s.class || s.class.createdBy !== userId) {
    reply.code(404).send({
      success: false,
      error: { code: "NOT_FOUND", message: "Resource not found" },
    });
    return false;
  }
  return true;
}

export async function assertOwnsChapter(
  prisma: PrismaClient,
  chapterId: string,
  userId: string,
  reply: FastifyReply,
): Promise<boolean> {
  const c = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { subject: { select: { class: { select: { createdBy: true } } } } },
  });
  if (!c || !c.subject?.class || c.subject.class.createdBy !== userId) {
    reply.code(404).send({
      success: false,
      error: { code: "NOT_FOUND", message: "Resource not found" },
    });
    return false;
  }
  return true;
}

export async function assertOwnsSubSubject(
  prisma: PrismaClient,
  subSubjectId: string,
  userId: string,
  reply: FastifyReply,
): Promise<boolean> {
  const ss = await prisma.subSubject.findUnique({
    where: { id: subSubjectId },
    select: { subject: { select: { class: { select: { createdBy: true } } } } },
  });
  if (!ss || !ss.subject?.class || ss.subject.class.createdBy !== userId) {
    reply.code(404).send({
      success: false,
      error: { code: "NOT_FOUND", message: "Resource not found" },
    });
    return false;
  }
  return true;
}
