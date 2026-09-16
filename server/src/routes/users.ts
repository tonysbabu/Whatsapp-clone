import { Router } from "express";
import { searchUsersQuerySchema } from "@whatsapp/shared";
import { prisma } from "../prisma.js";
import { toPublicUser } from "../serializers.js";

export const usersRouter = Router();

usersRouter.get("/search", async (req, res, next) => {
  try {
    const { q } = searchUsersQuerySchema.parse(req.query);
    const exactEmail = q.includes("@") ? q.toLowerCase() : null;
    const users = await prisma.user.findMany({
      where: {
        id: { not: req.userId },
        OR: [
          { displayName: { contains: q, mode: "insensitive" } },
          ...(exactEmail ? [{ email: exactEmail }] : []),
        ],
      },
      take: 20,
      orderBy: { displayName: "asc" },
    });
    res.json({ users: users.map((user) => toPublicUser(user, { includeEmail: false })) });
  } catch (err) {
    next(err);
  }
});
