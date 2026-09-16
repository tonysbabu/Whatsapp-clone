import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";
import { conversationTitle, formatListTime, initials } from "../lib/format";

export function ConversationList({
  onNewChat,
  onNewGroup,
}: {
  onNewChat: () => void;
  onNewGroup: () => void;
}) {
  const { user, logout } = useAuth();
  const { db, presence, networkOnline, socketConnected } = useChat();
  const [q, setQ] = useState("");
  const conversations = useLiveQuery(async () => {
    if (!db) return [];
    const items = await db.conversations.toArray();
    return items.sort((a, b) => {
      const at = a.lastMessage?.createdAt ?? a.createdAt;
      const bt = b.lastMessage?.createdAt ?? b.createdAt;
      return bt.localeCompare(at);
    });
  }, [db]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle || !user) return conversations ?? [];
    return (conversations ?? []).filter((c) =>
      conversationTitle(c.type, c.name, c.members, user.id).toLowerCase().includes(needle),
    );
  }, [conversations, q, user]);

  if (!user) return null;

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <div className="me">
          <span className="avatar">{initials(user.displayName)}</span>
          <div>
            <strong>{user.displayName}</strong>
            <small>
              {!networkOnline
                ? "Offline — queued sends"
                : socketConnected
                  ? "Connected"
                  : "Reconnecting…"}
            </small>
          </div>
        </div>
        <button className="ghost" onClick={logout} type="button">
          Log out
        </button>
      </header>
      <div className="sidebar-actions">
        <button type="button" onClick={onNewChat}>
          New chat
        </button>
        <button type="button" className="secondary" onClick={onNewGroup}>
          New group
        </button>
      </div>
      <input
        className="search"
        placeholder="Search chats"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <nav className="chat-list">
        {filtered.length === 0 && <p className="empty">No conversations yet.</p>}
        {filtered.map((c) => {
          const title = conversationTitle(c.type, c.name, c.members, user.id);
          const other = c.members.find((m) => m.userId !== user.id);
          const online = other ? presence[other.userId]?.online : false;
          return (
            <NavLink key={c.id} to={`/c/${c.id}`} className={({ isActive }) => `chat-row${isActive ? " active" : ""}`}>
              <span className={`avatar ${online && c.type === "dm" ? "online" : ""}`}>
                {initials(title)}
              </span>
              <span className="chat-row-body">
                <span className="chat-row-top">
                  <strong>{title}</strong>
                  <time>
                    {c.lastMessage ? formatListTime(c.lastMessage.createdAt) : ""}
                  </time>
                </span>
                <span className="chat-row-bottom">
                  <em>
                    {c.lastMessage?.deletedAt
                      ? "Message deleted"
                      : (c.lastMessage?.body ?? "No messages yet")}
                  </em>
                  {c.unreadCount > 0 && <b className="badge">{c.unreadCount}</b>}
                </span>
              </span>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
