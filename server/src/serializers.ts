import type { Conversation, ConversationMember, Message, User } from "@prisma/client";
import type { ConversationDTO, MemberDTO, MessageDTO, PublicUser } from "@whatsapp/shared";

type MemberWithUser = ConversationMember & { user: User };

export function toPublicUser(user: User, options: { includeEmail?: boolean } = {}): PublicUser {
  return {
    id: user.id,
    ...(options.includeEmail === false ? {} : { email: user.email }),
    displayName: user.displayName,
    lastSeenAt: user.lastSeenAt.toISOString(),
  };
}

export function toMemberDTO(member: MemberWithUser): MemberDTO {
  return {
    conversationId: member.conversationId,
    userId: member.userId,
    role: member.role,
    joinedAt: member.joinedAt.toISOString(),
    lastReadAt: member.lastReadAt?.toISOString() ?? null,
    user: toPublicUser(member.user),
  };
}

export function toMessageDTO(message: Message): MessageDTO {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    body: message.deletedAt ? "" : message.body,
    clientMsgId: message.clientMsgId,
    createdAt: message.createdAt.toISOString(),
    deletedAt: message.deletedAt?.toISOString() ?? null,
  };
}

export function toConversationDTO(
  conversation: Conversation & {
    members: MemberWithUser[];
    messages?: Message[];
  },
  unreadCount: number,
): ConversationDTO {
  const last = conversation.messages?.[0] ?? null;
  return {
    id: conversation.id,
    type: conversation.type,
    name: conversation.name,
    createdById: conversation.createdById,
    createdAt: conversation.createdAt.toISOString(),
    members: conversation.members.map(toMemberDTO),
    lastMessage: last ? toMessageDTO(last) : null,
    unreadCount,
  };
}

export function dmPairKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}
