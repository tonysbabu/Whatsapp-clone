import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { PublicUser } from "@whatsapp/shared";
import { api } from "../lib/api";
import { useChat } from "../context/ChatContext";
import { saveConversation } from "../lib/db";
import { getSocket } from "../lib/socket";

export function UserSearchModal({
  title,
  onClose,
  onPick,
}: {
  title: string;
  onClose: () => void;
  onPick?: (user: PublicUser) => void;
}) {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { db } = useChat();

  useEffect(() => {
    if (!q.trim()) {
      setUsers([]);
      return;
    }
    const handle = window.setTimeout(() => {
      api
        .searchUsers(q.trim())
        .then((res) => setUsers(res.users))
        .catch((err: Error) => setError(err.message));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [q]);

  async function openDm(user: PublicUser) {
    if (onPick) {
      onPick(user);
      return;
    }
    const { conversation } = await api.createDm(user.id);
    if (db) await saveConversation(db, conversation);
    getSocket()?.emit("conversation:join", conversation.id);
    onClose();
    navigate(`/c/${conversation.id}`);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>{title}</h3>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <input
          autoFocus
          placeholder="Search by name"
          value={q}
          onChange={(e) => {
            setError(null);
            setQ(e.target.value);
          }}
        />
        {error && <p className="error">{error}</p>}
        <ul className="user-list">
          {users.map((u) => (
            <li key={u.id}>
              <button type="button" onClick={() => void openDm(u)}>
                <strong>{u.displayName}</strong>
                {u.email ? <span>{u.email}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
