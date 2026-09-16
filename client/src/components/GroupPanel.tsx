import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { ConversationDTO } from "@whatsapp/shared";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";
import { api } from "../lib/api";
import { saveConversation } from "../lib/db";
import { UserSearchModal } from "./UserSearchModal";

export function GroupPanel({
  conversation,
  onClose,
}: {
  conversation: ConversationDTO;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { db } = useChat();
  const navigate = useNavigate();
  const me = conversation.members.find((m) => m.userId === user?.id);
  const isAdmin = me?.role === "admin";
  const [name, setName] = useState(conversation.name ?? "");
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function persist(next: ConversationDTO) {
    if (db) await saveConversation(db, next);
  }

  async function rename(e: FormEvent) {
    e.preventDefault();
    try {
      const { conversation: next } = await api.renameGroup(conversation.id, name.trim());
      await persist(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    }
  }

  async function remove(userId: string) {
    try {
      await api.removeMember(conversation.id, userId);
      if (userId === user?.id) {
        if (db) await db.conversations.delete(conversation.id);
        onClose();
        navigate("/");
        return;
      }
      const { conversation: next } = await api.conversation(conversation.id);
      await persist(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update members");
    }
  }

  return (
    <aside className="group-panel">
      <header>
        <h3>Group info</h3>
        <button type="button" className="ghost" onClick={onClose}>
          Close
        </button>
      </header>
      {isAdmin && (
        <form onSubmit={rename}>
          <input value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit">Rename</button>
        </form>
      )}
      <h4>Members</h4>
      <ul className="member-list">
        {conversation.members.map((m) => (
          <li key={m.userId}>
            <span>
              {m.user.displayName} <small>{m.role}</small>
            </span>
            {(isAdmin || m.userId === user?.id) && (
              <button type="button" className="linkish" onClick={() => void remove(m.userId)}>
                {m.userId === user?.id ? "Leave" : "Remove"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {isAdmin && (
        <button type="button" className="secondary" onClick={() => setPicker(true)}>
          Add member
        </button>
      )}
      {error && <p className="error">{error}</p>}
      {picker && (
        <UserSearchModal
          title="Add member"
          onClose={() => setPicker(false)}
          onPick={async (picked) => {
            try {
              const { conversation: next } = await api.addMember(conversation.id, picked.id);
              await persist(next);
              setPicker(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not add member");
            }
          }}
        />
      )}
    </aside>
  );
}
