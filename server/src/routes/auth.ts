import { Router } from "express";
import bcrypt from "bcryptjs";
import { loginSchema, registerSchema } from "@whatsapp/shared";
import { prisma } from "../prisma.js";
import { signToken } from "../auth.js";
import { HttpError } from "../httpError.js";
import { isUniqueConstraintError } from "../prismaErrors.js";
import { toPublicUser } from "../serializers.js";

export const authRouter = Router();

authRouter.post("/register", async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) {
      throw new HttpError(409, "Email already registered");
    }
    const passwordHash = await bcrypt.hash(body.password, 12);
    try {
      const user = await prisma.user.create({
        data: {
          email: body.email.toLowerCase(),
          displayName: body.displayName,
          passwordHash,
        },
      });
      res.status(201).json({ token: signToken(user.id), user: toPublicUser(user) });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new HttpError(409, "Email already registered");
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new HttpError(401, "Invalid email or password");
    }
    res.json({ token: signToken(user.id), user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) throw new HttpError(401, "Unauthorized");
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
});
