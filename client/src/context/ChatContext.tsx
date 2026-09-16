import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  MessageAck,
  MessageDeletedEvent,
  MessageDTO,
  PresenceUpdate,
  ReceiptReadEvent,
  TypingEvent,
} from "@whatsapp/shared";
import { useAuth } from "./AuthContext";
import { closeDb, openDb, upsertIncomingMessage, type ChatDatabase } from "../lib/db";
import { connectSocket, disconnectSocket, getSocket } from "../lib/socket";
import {
  applyAck,
  backfillAll,
  backfillMessages,
  enqueueMessage,
  flushOutbox,
  persistConversations,
  refreshConversation,
} from "../lib/sync";

type ChatContextValue = {
  db: ChatDatabase | null;
  presence: Record<string, PresenceUpdate>;
  typing: Record<string, string[]>;
  networkOnline: boolean;
  socketConnected: boolean;
  sendMessage: (conversationId: string, body: string) => Promise<void>;
  markRead: (conversationId: string) => void;
  setActiveConversationId: (conversationId: string | null) => void;
  startTyping: (conversationId: string) => void;
  stopTyping: (conversationId: string) => void;
  deleteMessage: (messageId: string) => void;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  const [db, setDb] = useState<ChatDatabase | null>(null);
  const [presence, setPresence] = useState<Record<string, PresenceUpdate>>({});
  const [typing, setTyping] = useState<Record<string, string[]>>({});
  const [networkOnline, setNetworkOnline] = useState(navigator.onLine);
  const [socketConnected, setSocketConnected] = useState(false);
  const activeConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    const on = () => setNetworkOnline(true);
    const off = () => setNetworkOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setDb(null);
      closeDb();
      return;
    }
    let cancelled = false;
    openDb(user.id).then((opened) => {
      if (!cancelled) setDb(opened);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!token || !user) {
      disconnectSocket();
      setSocketConnected(false);
      return;
    }
    if (!db) return;
    const socket = connectSocket(token);

    const syncFromServer = () =>
      persistConversations(db)
        .then(() => backfillAll(db))
        .then(() => flushOutbox(db, socket));

    const onConnect = () => {
      setSocketConnected(true);
      void syncFromServer();
    };
    const onDisconnect = () => setSocketConnected(false);
    const onNew = (message: MessageDTO) => {
      const viewing = activeConversationIdRef.current === message.conversationId;
      void upsertIncomingMessage(db, message, user.id, { viewing });
      if (viewing && message.senderId !== user.id) {
        socket.emit("receipt:read", { conversationId: message.conversationId });
      }
    };
    const onAck = (ack: MessageAck) => {
      void applyAck(db, ack);
    };
    const onDeleted = async (event: MessageDeletedEvent) => {
      const existing = await db.messages.get(event.messageId);
      if (existing) {
        await db.messages.put({ ...existing, body: "", deletedAt: event.deletedAt });
      }
    };
    const onTypingStart = (event: TypingEvent) => {
      if (event.userId === user.id) return;
      setTyping((prev) => {
        const current = new Set(prev[event.conversationId] ?? []);
        current.add(event.userId);
        return { ...prev, [event.conversationId]: [...current] };
      });
    };
    const onTypingStop = (event: TypingEvent) => {
      setTyping((prev) => {
        const current = (prev[event.conversationId] ?? []).filter((id) => id !== event.userId);
        return { ...prev, [event.conversationId]: current };
      });
    };
    const onPresence = (update: PresenceUpdate) => {
      setPresence((prev) => ({ ...prev, [update.userId]: update }));
    };
    const onReceipt = async (event: ReceiptReadEvent) => {
      const member = await db.members.get([event.conversationId, event.userId]);
      if (member) {
        await db.members.put({ ...member, lastReadAt: event.lastReadAt });
      }
      if (event.userId === user.id) {
        const conv = await db.conversations.get(event.conversationId);
        if (conv) await db.conversations.put({ ...conv, unreadCount: 0 });
      }
    };
    const onConversationUpdated = async ({ conversationId }: { conversationId: string }) => {
      const conversation = await refreshConversation(db, conversationId);
      socket.emit("conversation:join", conversation.id);
      await backfillMessages(db, conversation.id);
      if (activeConversationIdRef.current === conversationId) {
        socket.emit("receipt:read", { conversationId });
        const conv = await db.conversations.get(conversationId);
        if (conv) await db.conversations.put({ ...conv, unreadCount: 0 });
      }
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("message:new", onNew);
    socket.on("message:ack", onAck);
    socket.on("message:deleted", onDeleted);
    socket.on("typing:start", onTypingStart);
    socket.on("typing:stop", onTypingStop);
    socket.on("presence:update", onPresence);
    socket.on("receipt:read", onReceipt);
    socket.on("conversation:updated", onConversationUpdated);

    if (socket.connected) {
      setSocketConnected(true);
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("message:new", onNew);
      socket.off("message:ack", onAck);
      socket.off("message:deleted", onDeleted);
      socket.off("typing:start", onTypingStart);
      socket.off("typing:stop", onTypingStop);
      socket.off("presence:update", onPresence);
      socket.off("receipt:read", onReceipt);
      socket.off("conversation:updated", onConversationUpdated);
    };
  }, [token, user, db]);

  useEffect(() => {
    if (!networkOnline || !db) return;
    const socket = getSocket();
    if (socket?.connected) void flushOutbox(db, socket);
  }, [networkOnline, db]);

  const sendMessage = useCallback(
    async (conversationId: string, body: string) => {
      if (!db || !user) return;
      const local = await enqueueMessage(db, conversationId, body, user.id);
      const socket = getSocket();
      if (socket?.connected) {
        socket.emit("message:send", {
          conversationId,
          body: local.body,
          clientMsgId: local.clientMsgId,
        });
      }
    },
    [db, user],
  );

  const markRead = useCallback(
    (conversationId: string) => {
      const socket = getSocket();
      socket?.emit("receipt:read", { conversationId });
      if (!db) return;
      void db.conversations.get(conversationId).then((conv) => {
        if (conv) void db.conversations.put({ ...conv, unreadCount: 0 });
      });
    },
    [db],
  );

  const setActiveConversationId = useCallback((conversationId: string | null) => {
    activeConversationIdRef.current = conversationId;
  }, []);

  const startTyping = useCallback((conversationId: string) => {
    getSocket()?.emit("typing:start", { conversationId });
  }, []);

  const stopTyping = useCallback((conversationId: string) => {
    getSocket()?.emit("typing:stop", { conversationId });
  }, []);

  const deleteMessage = useCallback((messageId: string) => {
    getSocket()?.emit("message:delete", { messageId });
  }, []);

  const value = useMemo(
    () => ({
      db,
      presence,
      typing,
      networkOnline,
      socketConnected,
      sendMessage,
      markRead,
      setActiveConversationId,
      startTyping,
      stopTyping,
      deleteMessage,
    }),
    [
      db,
      presence,
      typing,
      networkOnline,
      socketConnected,
      sendMessage,
      markRead,
      setActiveConversationId,
      startTyping,
      stopTyping,
      deleteMessage,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
