import type {
  AuthResponse,
  AuthUser,
  ConversationDTO,
  MessageDTO,
  PublicUser,
} from "@whatsapp/shared";
import { getStoredToken } from "./session";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const inflightGets = new Map<string, Promise<unknown>>();

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  if (method === "GET") {
    const existing = inflightGets.get(path);
    if (existing) return existing as Promise<T>;
  }

  const run = (async () => {
    const token = getStoredToken();
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (token) headers.set("Authorization", `Bearer ${token}`);

    let res: Response;
    try {
      res = await fetch(path, { ...init, headers });
    } catch {
      throw new ApiError(0, "Can't reach the server. Is the API running on port 3001?");
    }
    if (res.status === 204) return undefined as T;
    const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
    if (!res.ok) {
      throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
    }
    return data;
  })();

  if (method === "GET") {
    inflightGets.set(path, run);
    void run.finally(() => {
      if (inflightGets.get(path) === run) inflightGets.delete(path);
    });
  }

  return run;
}

export const api = {
  register(body: { email: string; password: string; displayName: string }) {
    return request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify(body) });
  },
  login(body: { email: string; password: string }) {
    return request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(body) });
  },
  me() {
    return request<{ user: AuthUser }>("/auth/me");
  },
  searchUsers(q: string) {
    return request<{ users: PublicUser[] }>(`/users/search?q=${encodeURIComponent(q)}`);
  },
  conversations() {
    return request<{ conversations: ConversationDTO[] }>("/conversations");
  },
  conversation(id: string) {
    return request<{ conversation: ConversationDTO }>(`/conversations/${id}`);
  },
  createDm(userId: string) {
    return request<{ conversation: ConversationDTO }>("/conversations/dm", {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
  },
  createGroup(name: string, memberIds: string[]) {
    return request<{ conversation: ConversationDTO }>("/conversations/groups", {
      method: "POST",
      body: JSON.stringify({ name, memberIds }),
    });
  },
  sendMessage(id: string, body: { body: string; clientMsgId: string }) {
    return request<{ message: MessageDTO }>(`/conversations/${id}/messages`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  renameGroup(id: string, name: string) {
    return request<{ conversation: ConversationDTO }>(`/conversations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
  },
  addMember(id: string, userId: string) {
    return request<{ conversation: ConversationDTO }>(`/conversations/${id}/members`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
  },
  removeMember(id: string, userId: string) {
    return request<void>(`/conversations/${id}/members/${userId}`, { method: "DELETE" });
  },
  messages(id: string, query: { before?: string; after?: string; beforeId?: string; afterId?: string; limit?: number } = {}) {
    const params = new URLSearchParams();
    if (query.before) params.set("before", query.before);
    if (query.after) params.set("after", query.after);
    if (query.beforeId) params.set("beforeId", query.beforeId);
    if (query.afterId) params.set("afterId", query.afterId);
    if (query.limit) params.set("limit", String(query.limit));
    const qs = params.toString();
    return request<{ messages: MessageDTO[] }>(`/conversations/${id}/messages${qs ? `?${qs}` : ""}`);
  },
};
