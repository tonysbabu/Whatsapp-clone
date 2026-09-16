import type { MessageDTO } from "./types.js";

export function isCompleteMessageDTO(value: unknown): value is MessageDTO {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    typeof message.id === "string" &&
    typeof message.conversationId === "string" &&
    typeof message.senderId === "string" &&
    typeof message.body === "string" &&
    typeof message.clientMsgId === "string" &&
    typeof message.createdAt === "string" &&
    (message.deletedAt === null || typeof message.deletedAt === "string")
  );
}

export function isPermanentSendFailure(status?: number) {
  return status === 400 || status === 403 || status === 409;
}
