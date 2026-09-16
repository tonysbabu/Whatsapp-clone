import { Router } from "express";
import { searchUsersQuerySchema } from "@whatsapp/shared";
import { prisma } from "../prisma.js";
import { toPublicUser } from "../serializers.js";

export const usersRouter = Router();

usersRouter.get("/search", async (req, res, next) => {
  try {
    const { q } = searchUsersQuerySchema.parse(req.query);
    const users = await prisma.user.findMany({
      where: {
        id: { not: req.userId },
        OR: [
          { displayName: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 20,
      orderBy: { displayName: "asc" },
    });
    res.json({ users: users.map(toPublicUser) });
  } catch (err) {
    next(err);
  }
});
