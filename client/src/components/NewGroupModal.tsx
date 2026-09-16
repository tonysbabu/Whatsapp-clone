import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { PublicUser } from "@whatsapp/shared";
import { api } from "../lib/api";
import { useChat } from "../context/ChatContext";
import { saveConversation } from "../lib/db";
import { getSocket } from "../lib/socket";
import { UserSearchModal } from "./UserSearchModal";

export function NewGroupModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [members, setMembers] = useState<PublicUser[]>([]);
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { db } = useChat();

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const { conversation } = await api.createGroup(
        name.trim(),
        members.map((m) => m.id),
      );
      if (db) await saveConversation(db, conversation);
      getSocket()?.emit("conversation:join", conversation.id);
      onClose();
      navigate(`/c/${conversation.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create group");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>New group</h3>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <form onSubmit={submit}>
          <label>
            Group name
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
          </label>
          <div className="chips">
            {members.map((m) => (
              <span key={m.id} className="chip">
                {m.displayName}
                <button
                  type="button"
                  onClick={() => setMembers((prev) => prev.filter((x) => x.id !== m.id))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <button type="button" className="secondary" onClick={() => setPicker(true)}>
            Add members
          </button>
          {error && <p className="error">{error}</p>}
          <button type="submit">Create group</button>
        </form>
      </div>
      {picker && (
        <UserSearchModal
          title="Add people"
          onClose={() => setPicker(false)}
          onPick={(user) => {
            setMembers((prev) => (prev.some((m) => m.id === user.id) ? prev : [...prev, user]));
            setPicker(false);
          }}
        />
      )}
    </div>
  );
}
