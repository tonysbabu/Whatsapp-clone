import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  const existingToken = (socket?.auth as { token?: string } | undefined)?.token;
  if (socket && existingToken === token) {
    if (!socket.connected) socket.connect();
    return socket;
  }
  socket?.disconnect();
  socket = io({
    auth: { token },
    transports: ["websocket", "polling"],
    autoConnect: true,
  });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
