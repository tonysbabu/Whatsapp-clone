import Dexie from "dexie";
import {
  isCompleteMessageDTO,
  isPermanentSendFailure,
  type MessageAck,
  type MessageDTO,
} from "@whatsapp/shared";
import type { Socket } from "socket.io-client";
import { ApiError, api } from "./api";
import {
  type ChatDatabase,
  removeLocalConversation,
  saveConversation,
  toLocalMessage,
  upsertIncomingMessage,
} from "./db";

export async function persistConversations(db: ChatDatabase) {
  const { conversations } = await api.conversations();
  const keep = new Set(conversations.map((conversation) => conversation.id));
  await Promise.all(conversations.map((conversation) => saveConversation(db, conversation)));
  const local = await db.conversations.toArray();
  await Promise.all(
    local
      .filter((conversation) => !keep.has(conversation.id))
      .map((conversation) => removeLocalConversation(db, conversation.id)),
  );
}

export async function refreshConversation(db: ChatDatabase, conversationId: string) {
  try {
    const { conversation } = await api.conversation(conversationId);
    await saveConversation(db, conversation);
    return conversation;
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      await removeLocalConversation(db, conversationId);
      return null;
    }
    throw err;
  }
}

async function putMessagesAndCursor(
  db: ChatDatabase,
  conversationId: string,
  messages: MessageDTO[],
) {
  if (!messages.length) return;
  await db.messages.bulkPut(messages.map((message) => toLocalMessage(message)));
  const last = messages[messages.length - 1];
  await db.meta.put({
    key: `cursor:${conversationId}`,
    value: `${last.createdAt}|${last.id}`,
  });
}

function parseCursor(value: string | undefined) {
  if (!value) return {};
  const sep = value.lastIndexOf("|");
  if (sep === -1) return { after: value };
  return { after: value.slice(0, sep), afterId: value.slice(sep + 1) };
}

export async function backfillMessages(db: ChatDatabase, conversationId: string) {
  try {
    const cursorKey = `cursor:${conversationId}`;
    const cursor = await db.meta.get(cursorKey);
    const { messages } = await api.messages(conversationId, {
      ...parseCursor(cursor?.value),
      limit: 100,
    });
    if (!messages.length) {
      if (!cursor) {
        const latest = await api.messages(conversationId, { limit: 50 });
        await putMessagesAndCursor(db, conversationId, latest.messages);
      }
      return;
    }
    await putMessagesAndCursor(db, conversationId, messages);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      await removeLocalConversation(db, conversationId);
      return;
    }
    throw err;
  }
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
    beforeId: oldest.id,
    limit: 50,
  });
  if (!messages.length) return false;
  await db.messages.bulkPut(messages.map((message) => toLocalMessage(message)));
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

export async function applySendAck(
  db: ChatDatabase,
  clientMsgId: string,
  res?: { ok?: boolean; message?: MessageDTO; error?: string; status?: number },
) {
  if (res?.ok) {
    if (isCompleteMessageDTO(res.message)) {
      await upsertIncomingMessage(db, res.message, db.userId);
      await db.outbox.delete(clientMsgId);
    }
    return;
  }
  if (isPermanentSendFailure(res?.status)) {
    const existing = await db.messages.where("clientMsgId").equals(clientMsgId).first();
    if (existing) {
      await db.messages.put({ ...existing, status: "failed" });
    }
    await db.outbox.delete(clientMsgId);
    return;
  }
  const item = await db.outbox.get(clientMsgId);
  if (item) {
    await db.outbox.put({
      ...item,
      attempts: (item.attempts ?? 0) + 1,
      lastAttemptAt: new Date().toISOString(),
    });
  }
}

function outboxBackoffMs(attempts: number) {
  return Math.min(30_000, 1000 * 2 ** Math.min(attempts, 5));
}

function shouldSkipOutboxItem(item: { attempts?: number; lastAttemptAt?: string }) {
  if (!item.lastAttemptAt) return false;
  const wait = outboxBackoffMs(item.attempts ?? 0);
  return Date.now() - new Date(item.lastAttemptAt).getTime() < wait;
}

export async function flushOutbox(db: ChatDatabase, socket: Socket) {
  if (!socket.connected) return;
  const items = await db.outbox.toArray();
  for (const item of items) {
    if (shouldSkipOutboxItem(item)) continue;
    await new Promise<void>((resolve) => {
      socket.emit(
        "message:send",
        {
          conversationId: item.conversationId,
          body: item.body,
          clientMsgId: item.clientMsgId,
        },
        (res?: { ok?: boolean; message?: MessageDTO; error?: string; status?: number }) => {
          void applySendAck(db, item.clientMsgId, res).finally(resolve);
        },
      );
    });
  }
}

export async function sendQueuedMessage(
  db: ChatDatabase,
  conversationId: string,
  body: string,
  clientMsgId: string,
  socket: Socket | null,
  online: boolean,
) {
  if (socket?.connected) {
    await new Promise<void>((resolve) => {
      socket.emit(
        "message:send",
        { conversationId, body, clientMsgId },
        (res?: { ok?: boolean; message?: MessageDTO; error?: string; status?: number }) => {
          void applySendAck(db, clientMsgId, res).finally(resolve);
        },
      );
    });
    return;
  }
  if (!online) return;
  try {
    const { message } = await api.sendMessage(conversationId, { body, clientMsgId });
    await upsertIncomingMessage(db, message, db.userId);
    await db.outbox.delete(clientMsgId);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : undefined;
    await applySendAck(db, clientMsgId, { ok: false, status });
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
