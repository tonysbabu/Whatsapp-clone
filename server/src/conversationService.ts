import { Prisma } from "@prisma/client";
import {
  createDmSchema,
  createGroupSchema,
  addMemberSchema,
  renameGroupSchema,
  paginationQuerySchema,
} from "@whatsapp/shared";
import type { ConversationDTO } from "@whatsapp/shared";
import { prisma } from "./prisma.js";
import { HttpError } from "./httpError.js";
import { dmPairKey, toConversationDTO, toMessageDTO } from "./serializers.js";
import { emitConversationUpdated, joinConversationRoom, leaveConversationRoom } from "./io.js";

const memberInclude = {
  members: { include: { user: true } },
  messages: { orderBy: { createdAt: "desc" as const }, take: 1 },
};

export function getMembership(conversationId: string, userId: string) {
  return prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
}

export async function requireMembership(conversationId: string, userId: string) {
  const membership = await getMembership(conversationId, userId);
  if (!membership) {
    throw new HttpError(403, "Not a member of this conversation");
  }
  return membership;
}

export async function unreadCount(conversationId: string, userId: string, lastReadAt: Date | null) {
  return prisma.message.count({
    where: {
      conversationId,
      senderId: { not: userId },
      deletedAt: null,
      ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
    },
  });
}

async function memberIds(conversationId: string) {
  const members = await prisma.conversationMember.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

function notifyAndJoin(userIds: string[], conversationId: string) {
  joinConversationRoom(userIds, conversationId);
  emitConversationUpdated(userIds, conversationId);
}

export async function loadConversationDTO(conversationId: string, viewerId: string): Promise<ConversationDTO> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: memberInclude,
  });
  if (!conversation) {
    throw new HttpError(404, "Conversation not found");
  }
  const membership = conversation.members.find((m) => m.userId === viewerId);
  if (!membership) {
    throw new HttpError(403, "Not a member of this conversation");
  }
  const unread = await unreadCount(conversationId, viewerId, membership.lastReadAt);
  return toConversationDTO(conversation, unread);
}

export async function listConversations(viewerId: string): Promise<ConversationDTO[]> {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId: viewerId },
    include: { conversation: { include: memberInclude } },
  });

  const dtos = await Promise.all(
    memberships.map(async (m) => {
      const unread = await unreadCount(m.conversationId, viewerId, m.lastReadAt);
      return toConversationDTO(m.conversation, unread);
    }),
  );

  dtos.sort((a, b) => {
    const aTime = a.lastMessage?.createdAt ?? a.createdAt;
    const bTime = b.lastMessage?.createdAt ?? b.createdAt;
    return bTime.localeCompare(aTime);
  });
  return dtos;
}

async function conversationByDmKey(key: string) {
  return prisma.conversation.findUnique({
    where: { dmPairKey: key },
    include: memberInclude,
  });
}

export async function createOrOpenDm(viewerId: string, body: unknown) {
  const { userId } = createDmSchema.parse(body);
  if (userId === viewerId) throw new HttpError(400, "Cannot start a DM with yourself");
  const other = await prisma.user.findUnique({ where: { id: userId } });
  if (!other) throw new HttpError(404, "User not found");
  const key = dmPairKey(viewerId, userId);
  const existing = await conversationByDmKey(key);
  if (existing) {
    const member = existing.members.find((m) => m.userId === viewerId);
    const unread = member ? await unreadCount(existing.id, viewerId, member.lastReadAt) : 0;
    return { conversation: toConversationDTO(existing, unread), created: false };
  }

  try {
    const conversation = await prisma.conversation.create({
      data: {
        type: "dm",
        createdById: viewerId,
        dmPairKey: key,
        members: {
          create: [
            { userId: viewerId, role: "admin" },
            { userId, role: "member" },
          ],
        },
      },
      include: memberInclude,
    });
    notifyAndJoin([viewerId, userId], conversation.id);
    return { conversation: toConversationDTO(conversation, 0), created: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const raced = await conversationByDmKey(key);
      if (raced) {
        const member = raced.members.find((m) => m.userId === viewerId);
        const unread = member ? await unreadCount(raced.id, viewerId, member.lastReadAt) : 0;
        return { conversation: toConversationDTO(raced, unread), created: false };
      }
    }
    throw err;
  }
}

export async function createGroup(viewerId: string, body: unknown) {
  const { name, memberIds: rawIds } = createGroupSchema.parse(body);
  const uniqueIds = [...new Set(rawIds.filter((id) => id !== viewerId))];
  if (uniqueIds.length) {
    const found = await prisma.user.count({ where: { id: { in: uniqueIds } } });
    if (found !== uniqueIds.length) throw new HttpError(400, "One or more members not found");
  }
  const conversation = await prisma.conversation.create({
    data: {
      type: "group",
      name,
      createdById: viewerId,
      members: {
        create: [
          { userId: viewerId, role: "admin" },
          ...uniqueIds.map((userId) => ({ userId, role: "member" as const })),
        ],
      },
    },
    include: memberInclude,
  });
  notifyAndJoin([viewerId, ...uniqueIds], conversation.id);
  return toConversationDTO(conversation, 0);
}

export async function listMessages(conversationId: string, viewerId: string, query: unknown) {
  await requireMembership(conversationId, viewerId);
  const parsed = paginationQuerySchema.parse(query);
  if (parsed.after && parsed.before) {
    throw new HttpError(400, "Use either before or after, not both");
  }
  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      ...(parsed.after ? { createdAt: { gt: new Date(parsed.after) } } : {}),
      ...(parsed.before ? { createdAt: { lt: new Date(parsed.before) } } : {}),
    },
    orderBy: { createdAt: parsed.after ? "asc" : "desc" },
    take: parsed.limit,
  });
  const ordered = parsed.after ? messages : [...messages].reverse();
  return ordered.map(toMessageDTO);
}

export async function renameGroup(conversationId: string, viewerId: string, body: unknown) {
  const { name } = renameGroupSchema.parse(body);
  const member = await requireMembership(conversationId, viewerId);
  if (member.role !== "admin") throw new HttpError(403, "Only admins can rename the group");
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.type !== "group") throw new HttpError(400, "Not a group");
  await prisma.conversation.update({ where: { id: conversationId }, data: { name } });
  emitConversationUpdated(await memberIds(conversationId), conversationId);
  return loadConversationDTO(conversationId, viewerId);
}

export async function addMember(conversationId: string, viewerId: string, body: unknown) {
  const { userId } = addMemberSchema.parse(body);
  const member = await requireMembership(conversationId, viewerId);
  if (member.role !== "admin") throw new HttpError(403, "Only admins can add members");
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.type !== "group") throw new HttpError(400, "Not a group");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, "User not found");
  await prisma.conversationMember.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    create: { conversationId, userId, role: "member" },
    update: {},
  });
  notifyAndJoin(await memberIds(conversationId), conversationId);
  return loadConversationDTO(conversationId, viewerId);
}

async function promoteSuccessorIfNeeded(conversationId: string) {
  const remaining = await prisma.conversationMember.findMany({
    where: { conversationId },
    orderBy: { joinedAt: "asc" },
  });
  if (remaining.length === 0) return;
  if (remaining.some((m) => m.role === "admin")) return;
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId: remaining[0].userId } },
    data: { role: "admin" },
  });
}

export async function removeMember(conversationId: string, viewerId: string, targetUserId: string) {
  const member = await requireMembership(conversationId, viewerId);
  if (member.role !== "admin" && targetUserId !== viewerId) {
    throw new HttpError(403, "Only admins can remove other members");
  }
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.type !== "group") throw new HttpError(400, "Not a group");
  const ids = await memberIds(conversationId);
  await prisma.conversationMember.deleteMany({
    where: { conversationId, userId: targetUserId },
  });
  await promoteSuccessorIfNeeded(conversationId);
  leaveConversationRoom([targetUserId], conversationId);
  emitConversationUpdated(ids, conversationId);
}
