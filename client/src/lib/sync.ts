import Dexie from "dexie";
import type { MessageAck, MessageDTO } from "@whatsapp/shared";
import type { Socket } from "socket.io-client";
import { api } from "./api";
import {
  type ChatDatabase,
  saveConversation,
  toLocalMessage,
  upsertIncomingMessage,
} from "./db";

export async function persistConversations(db: ChatDatabase) {
  const { conversations } = await api.conversations();
  await Promise.all(conversations.map((c) => saveConversation(db, c)));
}

export async function refreshConversation(db: ChatDatabase, conversationId: string) {
  const { conversation } = await api.conversation(conversationId);
  await saveConversation(db, conversation);
  return conversation;
}

export async function backfillMessages(db: ChatDatabase, conversationId: string) {
  const cursorKey = `cursor:${conversationId}`;
  const cursor = await db.meta.get(cursorKey);
  const { messages } = await api.messages(conversationId, {
    after: cursor?.value,
    limit: 100,
  });
  if (!messages.length) {
    if (!cursor) {
      const latest = await api.messages(conversationId, { limit: 50 });
      if (latest.messages.length) {
        await db.messages.bulkPut(latest.messages.map((m) => toLocalMessage(m)));
        await db.meta.put({
          key: cursorKey,
          value: latest.messages[latest.messages.length - 1].createdAt,
        });
      }
    }
    return;
  }
  await db.messages.bulkPut(messages.map((m) => toLocalMessage(m)));
  const last = messages[messages.length - 1];
  await db.meta.put({ key: cursorKey, value: last.createdAt });
}

export async function loadOlderMessages(db: ChatDatabase, conversationId: string) {
  const oldest = await db.messages
    .where("[conversationId+createdAt]")
    .between([conversationId, Dexie.minKey], [conversationId, Dexie.maxKey])
    .first();
  if (!oldest) {
    await backfillMessages(db, conversationId);
    return false;
  }
  const { messages } = await api.messages(conversationId, {
    before: oldest.createdAt,
    limit: 50,
  });
  if (!messages.length) return false;
  await db.messages.bulkPut(messages.map((m) => toLocalMessage(m)));
  return true;
}

export async function backfillAll(db: ChatDatabase) {
  const conversations = await db.conversations.toArray();
  for (const conv of conversations) {
    await backfillMessages(db, conv.id);
  }
}

export async function applyAck(db: ChatDatabase, ack: MessageAck) {
  const existing = await db.messages.where("clientMsgId").equals(ack.clientMsgId).first();
  if (!existing) return;
  if (existing.id !== ack.serverId) {
    await db.messages.delete(existing.id);
  }
  await db.messages.put({
    ...existing,
    id: ack.serverId,
    createdAt: ack.createdAt,
    status: "sent",
  });
  await db.outbox.delete(ack.clientMsgId);
}

export async function flushOutbox(db: ChatDatabase, socket: Socket) {
  if (!socket.connected) return;
  const items = await db.outbox.toArray();
  for (const item of items) {
    await new Promise<void>((resolve) => {
      socket.emit(
        "message:send",
        {
          conversationId: item.conversationId,
          body: item.body,
          clientMsgId: item.clientMsgId,
        },
        (res?: { ok?: boolean; message?: MessageDTO; error?: string }) => {
          if (res?.ok && res.message) {
            void upsertIncomingMessage(db, res.message, db.userId).then(() =>
              db.outbox.delete(item.clientMsgId),
            );
          }
          resolve();
        },
      );
    });
  }
}

export async function enqueueMessage(
  db: ChatDatabase,
  conversationId: string,
  body: string,
  senderId: string,
) {
  const clientMsgId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const local = toLocalMessage(
    {
      id: clientMsgId,
      conversationId,
      senderId,
      body,
      clientMsgId,
      createdAt,
      deletedAt: null,
    },
    "pending",
  );
  await db.messages.put(local);
  await db.outbox.put({ clientMsgId, conversationId, body, createdAt });
  const conv = await db.conversations.get(conversationId);
  if (conv) {
    await db.conversations.put({ ...conv, lastMessage: local, unreadCount: 0 });
  }
  return local;
}
