import type { Server } from "socket.io";

let io: Server | null = null;

export function setIo(server: Server) {
  io = server;
}

export function getIo() {
  return io;
}

export function joinConversationRoom(userIds: string[], conversationId: string) {
  const server = getIo();
  if (!server) return;
  for (const userId of userIds) {
    void server.in(`user:${userId}`).socketsJoin(`conversation:${conversationId}`);
  }
}

export function leaveConversationRoom(userIds: string[], conversationId: string) {
  const server = getIo();
  if (!server) return;
  for (const userId of userIds) {
    void server.in(`user:${userId}`).socketsLeave(`conversation:${conversationId}`);
  }
}

export function emitConversationUpdated(userIds: string[], conversationId: string) {
  const server = getIo();
  if (!server) return;
  for (const userId of userIds) {
    server.to(`user:${userId}`).emit("conversation:updated", { conversationId });
  }
}
