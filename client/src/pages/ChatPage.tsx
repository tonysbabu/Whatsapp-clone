import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ConversationList } from "../components/ConversationList";
import { Composer } from "../components/Composer";
import { GroupPanel } from "../components/GroupPanel";
import { MessageThread } from "../components/MessageThread";
import { NewGroupModal } from "../components/NewGroupModal";
import { UserSearchModal } from "../components/UserSearchModal";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";
import { conversationTitle, formatListTime } from "../lib/format";
import { backfillMessages } from "../lib/sync";

export function ChatPage() {
  const { conversationId } = useParams();
  const { user } = useAuth();
  const { db, presence, typing, markRead, setActiveConversationId } = useChat();
  const [newChat, setNewChat] = useState(false);
  const [newGroup, setNewGroup] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const conversation = useLiveQuery(async () => {
    if (!db || !conversationId) return undefined;
    return db.conversations.get(conversationId);
  }, [db, conversationId]);

  const members = useLiveQuery(async () => {
    if (!db || !conversationId) return [];
    return db.members.where("conversationId").equals(conversationId).toArray();
  }, [db, conversationId]);

  useEffect(() => {
    setActiveConversationId(conversationId ?? null);
  }, [conversationId, setActiveConversationId]);

  useEffect(() => {
    if (!conversationId || !db) return;
    void backfillMessages(db, conversationId);
    markRead(conversationId);
  }, [conversationId, db, markRead]);

  const title = useMemo(() => {
    if (!conversation || !user) return "";
    return conversationTitle(conversation.type, conversation.name, conversation.members, user.id);
  }, [conversation, user]);

  const other = conversation?.members.find((m) => m.userId !== user?.id);
  const otherPresence = other ? presence[other.userId] : undefined;
  const typingIds = (conversationId && typing[conversationId]) || [];
  const typingLabel = typingIds
    .map((id) => conversation?.members.find((m) => m.userId === id)?.user.displayName)
    .filter(Boolean)
    .join(", ");

  return (
    <div className={`app-shell ${conversationId ? "thread-open" : ""}`}>
      <ConversationList onNewChat={() => setNewChat(true)} onNewGroup={() => setNewGroup(true)} />
      <section className="main">
        {!conversationId && (
          <div className="placeholder">
            <h2>Select a chat</h2>
            <p>Search for a user or create a group to start messaging.</p>
          </div>
        )}
        {conversationId && !conversation && (
          <div className="placeholder">
            <p>Conversation not found on this device yet.</p>
          </div>
        )}
        {conversation && user && conversationId && (
          <>
            <header className="thread-header">
              <Link to="/" className="back">
                ←
              </Link>
              <div>
                <strong>{title}</strong>
                <small>
                  {conversation.type === "dm"
                    ? otherPresence?.online
                      ? "online"
                      : `last seen ${otherPresence?.lastSeenAt ? formatListTime(otherPresence.lastSeenAt) : formatListTime(other?.user.lastSeenAt ?? conversation.createdAt)}`
                    : `${conversation.members.length} members`}
                  {typingLabel ? ` · ${typingLabel} typing…` : ""}
                </small>
              </div>
              {conversation.type === "group" && (
                <button type="button" className="ghost" onClick={() => setInfoOpen((v) => !v)}>
                  Info
                </button>
              )}
            </header>
            <MessageThread conversationId={conversationId} members={members ?? []} me={user.id} />
            <Composer conversationId={conversationId} />
          </>
        )}
      </section>
      {infoOpen && conversation?.type === "group" && (
        <GroupPanel
          conversation={{ ...conversation, members: members?.length ? members : conversation.members }}
          onClose={() => setInfoOpen(false)}
        />
      )}
      {newChat && <UserSearchModal title="New chat" onClose={() => setNewChat(false)} />}
      {newGroup && <NewGroupModal onClose={() => setNewGroup(false)} />}
    </div>
  );
}
