import "dotenv/config";
import http from "node:http";
import cors from "cors";
import express from "express";
import { Server } from "socket.io";
import { setIo } from "./io.js";
import { errorHandler, requireAuth } from "./middleware.js";
import { allowAuthAttempt } from "./rateLimit.js";
import { HttpError } from "./httpError.js";
import { prisma } from "./prisma.js";
import { authRouter } from "./routes/auth.js";
import { conversationsRouter } from "./routes/conversations.js";
import { usersRouter } from "./routes/users.js";
import { attachSockets } from "./socket.js";

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: "32kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false, error: "Database unavailable" });
  }
});

app.use("/auth", (req, res, next) => {
  if (req.path === "/register" || req.path === "/login") {
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    if (!allowAuthAttempt(ip)) {
      next(new HttpError(429, "Too many auth attempts"));
      return;
    }
  }
  if (req.path === "/me") {
    requireAuth(req, res, next);
    return;
  }
  next();
}, authRouter);
app.use("/users", requireAuth, usersRouter);
app.use("/conversations", requireAuth, conversationsRouter);
app.use(errorHandler);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN, credentials: true },
});
setIo(io);
attachSockets(io);

server.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
