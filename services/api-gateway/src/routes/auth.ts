import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../lib/env";

interface AuthRouteOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
}

export async function authRoutes(
  app: FastifyInstance,
  opts: AuthRouteOptions
) {
  const { prisma } = opts;
  const JWT_SECRET = env.JWT_SECRET;
  // Bcrypt cost 12 ≈ 250ms per hash on modern hardware — slow enough to hurt
  // offline brute force, fast enough that login is imperceptible. Anything
  // lower than 12 is considered weak by OWASP as of 2024.
  const BCRYPT_COST = 12;

  // POST /auth/register — tight limit to slow email enumeration
  app.post("/register", {
    config: {
      rateLimit: { max: 5, timeWindow: "10 minutes" },
    },
  }, async (req, reply) => {
    const body = req.body as {
      email: string;
      password: string;
      name: string;
      role?: "TEACHER" | "STUDENT";
      cohortId?: string;
    };

    const existing = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (existing) {
      return reply.code(409).send({
        success: false,
        error: { code: "EMAIL_TAKEN", message: "Email already registered" },
      });
    }

    const hashedPassword = await bcrypt.hash(body.password, BCRYPT_COST);

    const user = await prisma.user.create({
      data: {
        email: body.email,
        password: hashedPassword,
        name: body.name,
        role: body.role ?? "STUDENT",
        cohortId: body.cohortId,
      },
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, cohortId: user.cohortId },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    return reply.code(201).send({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      },
    });
  });

  // POST /auth/login — tight limit to slow credential-stuffing
  app.post("/login", {
    config: {
      rateLimit: { max: 10, timeWindow: "5 minutes" },
    },
  }, async (req, reply) => {
    const body = req.body as { email: string; password: string };

    const user = await prisma.user.findUnique({ where: { email: body.email } });

    if (!user || !(await bcrypt.compare(body.password, user.password))) {
      return reply.code(401).send({
        success: false,
        error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" },
      });
    }

    // Transparently upgrade hashes below BCRYPT_COST on successful login.
    // bcrypt hashes encode the cost as `$2a$<cost>$...` — parse and compare.
    const currentCostMatch = /^\$2[aby]\$(\d+)\$/.exec(user.password);
    const currentCost = currentCostMatch ? Number(currentCostMatch[1]) : 0;
    if (currentCost < BCRYPT_COST) {
      const rehashed = await bcrypt.hash(body.password, BCRYPT_COST);
      // Fire-and-forget: don't slow down login if the update hiccups.
      prisma.user.update({ where: { id: user.id }, data: { password: rehashed } })
        .catch((err) => app.log.warn({ err, userId: user.id }, "bcrypt rehash failed"));
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, cohortId: user.cohortId },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    return reply.send({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      },
    });
  });
}
