export type ConversationType = "dm" | "group";
export type MemberRole = "admin" | "member";
export type MessageStatus = "pending" | "sent" | "delivered" | "read";

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  lastSeenAt: string;
};

export type AuthUser = PublicUser;

export type MemberDTO = {
  conversationId: string;
  userId: string;
  role: MemberRole;
  joinedAt: string;
  lastReadAt: string | null;
  user: PublicUser;
};

export type MessageDTO = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  clientMsgId: string;
  createdAt: string;
  deletedAt: string | null;
};

export type ConversationDTO = {
  id: string;
  type: ConversationType;
  name: string | null;
  createdById: string;
  createdAt: string;
  members: MemberDTO[];
  lastMessage: MessageDTO | null;
  unreadCount: number;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

export type MessageAck = {
  clientMsgId: string;
  serverId: string;
  createdAt: string;
};

export type PresenceUpdate = {
  userId: string;
  online: boolean;
  lastSeenAt: string;
};

export type TypingEvent = {
  conversationId: string;
  userId: string;
};

export type ReceiptReadEvent = {
  conversationId: string;
  userId: string;
  lastReadAt: string;
};

export type MessageDeletedEvent = {
  messageId: string;
  conversationId: string;
  deletedAt: string;
};
