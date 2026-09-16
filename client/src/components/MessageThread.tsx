import { useVirtualizer } from "@tanstack/react-virtual";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { useChat } from "../context/ChatContext";
import { ticksFor, type LocalMessage } from "../lib/db";
import { formatTime } from "../lib/format";
import { loadOlderMessages } from "../lib/sync";
import type { MemberDTO } from "@whatsapp/shared";

export function MessageThread({
  conversationId,
  members,
  me,
}: {
  conversationId: string;
  members: MemberDTO[];
  me: string;
}) {
  const { db, deleteMessage } = useChat();
  const parentRef = useRef<HTMLDivElement>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const stickToBottom = useRef(true);

  const messages =
    useLiveQuery(async () => {
      if (!db) return [];
      return db.messages
        .where("[conversationId+createdAt]")
        .between([conversationId, ""], [conversationId, "\uffff"])
        .toArray();
    }, [db, conversationId]) ?? [];

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 18,
  });

  useEffect(() => {
    stickToBottom.current = true;
    if (messages.length) {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
      });
    }
  }, [conversationId]);

  useEffect(() => {
    if (stickToBottom.current && messages.length) {
      virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
    }
  }, [messages.length, virtualizer]);

  async function maybeLoadOlder() {
    const el = parentRef.current;
    if (!el || !db || loadingOlder || messages.length === 0) return;
    if (el.scrollTop > 80) return;
    setLoadingOlder(true);
    const prevHeight = el.scrollHeight;
    try {
      const more = await loadOlderMessages(db, conversationId);
      if (more) {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight - prevHeight;
        });
      }
    } finally {
      setLoadingOlder(false);
    }
  }

  return (
    <div
      className="thread"
      ref={parentRef}
      onScroll={() => {
        const el = parentRef.current;
        if (!el) return;
        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        void maybeLoadOlder();
      }}
    >
      <div
        className="thread-inner"
        style={{ height: virtualizer.getTotalSize(), position: "relative" }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const message = messages[item.index];
          return (
            <div
              key={message.id}
              data-index={item.index}
              ref={virtualizer.measureElement}
              className="virtual-row"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <Bubble message={message} me={me} members={members} onDelete={deleteMessage} />
            </div>
          );
        })}
      </div>
      {messages.length === 0 && <p className="empty thread-empty">No messages yet. Say hello.</p>}
    </div>
  );
}

function Bubble({
  message,
  me,
  members,
  onDelete,
}: {
  message: LocalMessage;
  me: string;
  members: MemberDTO[];
  onDelete: (id: string) => void;
}) {
  const mine = message.senderId === me;
  const sender = members.find((m) => m.userId === message.senderId)?.user.displayName;
  const status = ticksFor(message, members, me);
  return (
    <div className={`bubble-row ${mine ? "mine" : ""}`}>
      <div className="bubble">
        {!mine && <span className="sender">{sender}</span>}
        {message.deletedAt ? (
          <p className="deleted">Message deleted</p>
        ) : (
          <p>{message.body}</p>
        )}
        <span className="meta">
          <time>{formatTime(message.createdAt)}</time>
          {mine && !message.deletedAt && (
            <span className={`ticks ${status}`}>{status === "read" ? "✓✓" : status === "pending" ? "◌" : "✓"}</span>
          )}
          {mine && !message.deletedAt && message.status !== "pending" && (
            <button type="button" className="linkish" onClick={() => onDelete(message.id)}>
              Delete
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
