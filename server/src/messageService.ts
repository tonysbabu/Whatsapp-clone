import { Prisma } from "@prisma/client";
import type { Message } from "@prisma/client";
import { prisma } from "./prisma.js";
import { HttpError } from "./httpError.js";
import { getMembership } from "./conversationService.js";
import { allowMessageSend } from "./rateLimit.js";
import { getIo } from "./io.js";
import { toMessageDTO } from "./serializers.js";

export type SendMessageInput = {
  conversationId: string;
  body: string;
  clientMsgId: string;
};

export async function persistMessage(userId: string, input: SendMessageInput) {
  if (!allowMessageSend(userId)) {
    throw new HttpError(429, "Rate limited");
  }
  const member = await getMembership(input.conversationId, userId);
  if (!member) {
    throw new HttpError(403, "Not a member of this conversation");
  }

  const existing = await prisma.message.findUnique({
    where: { senderId_clientMsgId: { senderId: userId, clientMsgId: input.clientMsgId } },
  });
  if (existing) {
    if (existing.conversationId !== input.conversationId) {
      throw new HttpError(409, "clientMsgId already used");
    }
    return { message: existing, created: false };
  }

  try {
    const message = await prisma.message.create({
      data: {
        conversationId: input.conversationId,
        senderId: userId,
        body: input.body,
        clientMsgId: input.clientMsgId,
      },
    });
    return { message, created: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const raced = await prisma.message.findUnique({
        where: { senderId_clientMsgId: { senderId: userId, clientMsgId: input.clientMsgId } },
      });
      if (raced) return { message: raced, created: false };
    }
    throw err;
  }
}

export function broadcastMessage(message: Message, created: boolean) {
  const io = getIo();
  if (!io || !created) return;
  io.to(`conversation:${message.conversationId}`).emit("message:new", toMessageDTO(message));
}

export function ackMessage(userId: string, message: Message) {
  const io = getIo();
  if (!io) return;
  io.to(`user:${userId}`).emit("message:ack", {
    clientMsgId: message.clientMsgId,
    serverId: message.id,
    createdAt: message.createdAt.toISOString(),
  });
}
