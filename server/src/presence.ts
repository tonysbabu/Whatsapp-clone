const onlineUsers = new Map<string, Set<string>>();

export function trackOnline(userId: string, socketId: string) {
  const set = onlineUsers.get(userId) ?? new Set<string>();
  set.add(socketId);
  onlineUsers.set(userId, set);
  return set.size === 1;
}

export function trackOffline(userId: string, socketId: string) {
  const set = onlineUsers.get(userId);
  if (!set) return true;
  set.delete(socketId);
  if (set.size === 0) {
    onlineUsers.delete(userId);
    return true;
  }
  return false;
}

export function isOnline(userId: string) {
  return (onlineUsers.get(userId)?.size ?? 0) > 0;
}

export function onlineUserIds() {
  return [...onlineUsers.keys()];
}
