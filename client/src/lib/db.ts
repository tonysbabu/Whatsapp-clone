import Dexie, { type Table } from "dexie";
import type { ConversationDTO, MemberDTO, MessageDTO, MessageStatus } from "@whatsapp/shared";

export type LocalMessage = MessageDTO & { status: MessageStatus };

export type OutboxItem = {
  clientMsgId: string;
  conversationId: string;
  body: string;
  createdAt: string;
  attempts?: number;
  lastAttemptAt?: string;
};

export class ChatDatabase extends Dexie {
  conversations!: Table<ConversationDTO, string>;
  members!: Table<MemberDTO, [string, string]>;
  messages!: Table<LocalMessage, string>;
  outbox!: Table<OutboxItem, string>;
  meta!: Table<{ key: string; value: string }, string>;
  readonly userId: string;

  constructor(userId: string) {
    super(`whatsapp-clone-${userId}`);
    this.userId = userId;
    this.version(1).stores({
      conversations: "id, type, createdAt",
      members: "[conversationId+userId], conversationId, userId",
      messages: "id, clientMsgId, conversationId, [conversationId+createdAt], createdAt",
      outbox: "clientMsgId, conversationId",
      meta: "key",
    });
  }
}

let current: ChatDatabase | null = null;

export function getDb(): ChatDatabase {
  if (!current) throw new Error("IndexedDB is not open");
  return current;
}

export async function openDb(userId: string): Promise<ChatDatabase> {
  if (current?.userId === userId) return current;
  current?.close();
  current = new ChatDatabase(userId);
  await current.open();
  return current;
}

export function closeDb() {
  current?.close();
  current = null;
}

export function toLocalMessage(message: MessageDTO, status: MessageStatus = "sent"): LocalMessage {
  return { ...message, status };
}

export async function saveConversation(db: ChatDatabase, conversation: ConversationDTO) {
  await db.conversations.put(conversation);
  await db.members.bulkPut(conversation.members);
  const keep = new Set(conversation.members.map((member) => member.userId));
  const existing = await db.members.where("conversationId").equals(conversation.id).toArray();
  const staleKeys = existing
    .filter((member) => !keep.has(member.userId))
    .map((member) => [member.conversationId, member.userId] as [string, string]);
  if (staleKeys.length) {
    await db.members.bulkDelete(staleKeys);
  }
}

export async function removeLocalConversation(db: ChatDatabase, conversationId: string) {
  await db.members.where("conversationId").equals(conversationId).delete();
  await db.messages.where("conversationId").equals(conversationId).delete();
  await db.outbox.where("conversationId").equals(conversationId).delete();
  await db.meta.delete(`cursor:${conversationId}`);
  await db.conversations.delete(conversationId);
}

export async function upsertIncomingMessage(
  db: ChatDatabase,
  message: MessageDTO,
  me: string,
  options: { viewing?: boolean } = {},
) {
  const existing = await db.messages.where("clientMsgId").equals(message.clientMsgId).first();
  const status: MessageStatus =
    existing?.status === "pending" ||
    existing?.status === "failed" ||
    existing?.status === "sent" ||
    existing?.status === "read"
      ? existing.status === "pending" || existing.status === "failed"
        ? "sent"
        : existing.status
      : "sent";
  if (existing && existing.id !== message.id) {
    await db.messages.delete(existing.id);
  }
  await db.messages.put(toLocalMessage(message, message.senderId === me ? status : "sent"));
  const cursorKey = `cursor:${message.conversationId}`;
  const cursor = await db.meta.get(cursorKey);
  if (!cursor || cursor.value < message.createdAt) {
    await db.meta.put({ key: cursorKey, value: message.createdAt });
  }
  const conv = await db.conversations.get(message.conversationId);
  if (conv) {
    const isNewer = !conv.lastMessage || conv.lastMessage.createdAt <= message.createdAt;
    if (isNewer) {
      const unreadBump = options.viewing
        ? 0
        : message.senderId !== me && message.deletedAt === null
          ? conv.unreadCount + (existing ? 0 : 1)
          : conv.unreadCount;
      await db.conversations.put({
        ...conv,
        lastMessage: message,
        unreadCount: unreadBump,
      });
    }
  }
}

export function ticksFor(message: LocalMessage, members: MemberDTO[], me: string): MessageStatus {
  if (message.senderId !== me) return message.status;
  if (message.status === "pending" || message.status === "failed") return message.status;
  const others = members.filter((m) => m.userId !== me);
  if (others.length === 0) return "sent";
  const read = others.every((m) => m.lastReadAt && m.lastReadAt >= message.createdAt);
  return read ? "read" : "sent";
}
