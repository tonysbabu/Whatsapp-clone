const MESSAGE_WINDOW_MS = 10_000;
const MESSAGE_MAX_EVENTS = 20;
const AUTH_WINDOW_MS = 60_000;
const AUTH_MAX_EVENTS = 20;

const messageHits = new Map<string, number[]>();
const authHits = new Map<string, number[]>();

function allow(store: Map<string, number[]>, key: string, windowMs: number, maxEvents: number) {
  const now = Date.now();
  const recent = (store.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= maxEvents) {
    store.set(key, recent);
    return false;
  }
  recent.push(now);
  store.set(key, recent);
  return true;
}

export function allowMessageSend(userId: string): boolean {
  return allow(messageHits, userId, MESSAGE_WINDOW_MS, MESSAGE_MAX_EVENTS);
}

export function allowAuthAttempt(ip: string): boolean {
  return allow(authHits, ip, AUTH_WINDOW_MS, AUTH_MAX_EVENTS);
}
