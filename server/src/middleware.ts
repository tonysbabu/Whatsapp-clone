import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { verifyToken } from "./auth.js";
import { HttpError } from "./httpError.js";

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    next(new HttpError(401, "Unauthorized"));
    return;
  }
  try {
    req.userId = verifyToken(token).sub;
    next();
  } catch {
    next(new HttpError(401, "Unauthorized"));
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Invalid request", details: err.flatten() });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
