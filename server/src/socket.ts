import type { Server, Socket } from "socket.io";
import {
  messageDeleteSchema,
  messageSendSchema,
  receiptReadSchema,
  typingSchema,
} from "@whatsapp/shared";
import { prisma } from "./prisma.js";
import { verifyToken } from "./auth.js";
import { getMembership } from "./conversationService.js";
import { ackMessage, broadcastMessage, persistMessage } from "./messageService.js";
import { HttpError } from "./httpError.js";
import { isOnline, trackOffline, trackOnline } from "./presence.js";
import { toMessageDTO } from "./serializers.js";

type AuthedSocket = Socket & { userId: string };

async function requireMember(conversationId: string, userId: string) {
  return getMembership(conversationId, userId);
}

async function contactUserIds(userId: string) {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId },
    select: { conversationId: true },
  });
  if (!memberships.length) return [];
  const others = await prisma.conversationMember.findMany({
    where: {
      conversationId: { in: memberships.map((m) => m.conversationId) },
      userId: { not: userId },
    },
    select: { userId: true },
    distinct: ["userId"],
  });
  return others.map((m) => m.userId);
}

function emitPresenceToUsers(
  io: Server,
  userIds: string[],
  payload: { userId: string; online: boolean; lastSeenAt: string },
) {
  for (const id of userIds) {
    io.to(`user:${id}`).emit("presence:update", payload);
  }
}

async function emitPresenceSnapshot(socket: AuthedSocket) {
  const contacts = await contactUserIds(socket.userId);
  const onlineContacts = contacts.filter((id) => isOnline(id));
  if (!onlineContacts.length) return;
  const users = await prisma.user.findMany({
    where: { id: { in: onlineContacts } },
    select: { id: true, lastSeenAt: true },
  });
  for (const user of users) {
    socket.emit("presence:update", {
      userId: user.id,
      online: isOnline(user.id),
      lastSeenAt: user.lastSeenAt.toISOString(),
    });
  }
}

export function attachSockets(io: Server) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error("Unauthorized"));
      return;
    }
    try {
      const payload = verifyToken(token);
      (socket as AuthedSocket).userId = payload.sub;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", async (raw) => {
    const socket = raw as AuthedSocket;
    const { userId } = socket;
    socket.join(`user:${userId}`);

    const memberships = await prisma.conversationMember.findMany({
      where: { userId },
      select: { conversationId: true },
    });
    for (const m of memberships) {
      socket.join(`conversation:${m.conversationId}`);
    }

    const becameOnline = trackOnline(userId, socket.id);
    const now = new Date();
    await prisma.user.update({ where: { id: userId }, data: { lastSeenAt: now } });
    if (becameOnline) {
      emitPresenceToUsers(io, await contactUserIds(userId), {
        userId,
        online: true,
        lastSeenAt: now.toISOString(),
      });
    }
    await emitPresenceSnapshot(socket);

    socket.on("message:send", async (payload, ack) => {
      try {
        const data = messageSendSchema.parse(payload);
        const { message, created } = await persistMessage(userId, data);
        broadcastMessage(message, created);
        ackMessage(userId, message);
        ack?.({ ok: true, message: toMessageDTO(message) });
      } catch (err) {
        const status = err instanceof HttpError ? err.status : 400;
        ack?.({ error: err instanceof Error ? err.message : "Send failed", status });
      }
    });

    socket.on("message:delete", async (payload) => {
      try {
        const data = messageDeleteSchema.parse(payload);
        const message = await prisma.message.findUnique({ where: { id: data.messageId } });
        if (!message || message.senderId !== userId) return;
        const member = await requireMember(message.conversationId, userId);
        if (!member) return;
        const updated = await prisma.message.update({
          where: { id: message.id },
          data: { deletedAt: new Date() },
        });
        io.to(`conversation:${message.conversationId}`).emit("message:deleted", {
          messageId: updated.id,
          conversationId: updated.conversationId,
          deletedAt: updated.deletedAt!.toISOString(),
        });
      } catch {
        // ignore malformed delete payloads
      }
    });

    socket.on("typing:start", async (payload) => {
      try {
        const data = typingSchema.parse(payload);
        const member = await requireMember(data.conversationId, userId);
        if (!member) return;
        socket.to(`conversation:${data.conversationId}`).emit("typing:start", {
          conversationId: data.conversationId,
          userId,
        });
      } catch {
        // ignore
      }
    });

    socket.on("typing:stop", async (payload) => {
      try {
        const data = typingSchema.parse(payload);
        const member = await requireMember(data.conversationId, userId);
        if (!member) return;
        socket.to(`conversation:${data.conversationId}`).emit("typing:stop", {
          conversationId: data.conversationId,
          userId,
        });
      } catch {
        // ignore
      }
    });

    socket.on("receipt:read", async (payload) => {
      try {
        const data = receiptReadSchema.parse(payload);
        const member = await requireMember(data.conversationId, userId);
        if (!member) return;
        const lastReadAt = new Date();
        await prisma.conversationMember.update({
          where: { conversationId_userId: { conversationId: data.conversationId, userId } },
          data: { lastReadAt },
        });
        io.to(`conversation:${data.conversationId}`).emit("receipt:read", {
          conversationId: data.conversationId,
          userId,
          lastReadAt: lastReadAt.toISOString(),
        });
      } catch {
        // ignore
      }
    });

    socket.on("conversation:join", async (conversationId: string, ack?: (result: unknown) => void) => {
      try {
        if (typeof conversationId !== "string") {
          ack?.({ error: "Invalid conversation" });
          return;
        }
        const member = await requireMember(conversationId, userId);
        if (!member) {
          ack?.({ error: "Forbidden" });
          return;
        }
        socket.join(`conversation:${conversationId}`);
        ack?.({ ok: true });
      } catch {
        ack?.({ error: "Join failed" });
      }
    });

    socket.on("disconnect", async () => {
      const wentOffline = trackOffline(userId, socket.id);
      const lastSeenAt = new Date();
      await prisma.user.update({ where: { id: userId }, data: { lastSeenAt } });
      if (wentOffline) {
        emitPresenceToUsers(io, await contactUserIds(userId), {
          userId,
          online: false,
          lastSeenAt: lastSeenAt.toISOString(),
        });
      }
    });
  });
}
