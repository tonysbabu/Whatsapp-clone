import { z } from "zod";

export const conversationTypeSchema = z.enum(["dm", "group"]);
export const memberRoleSchema = z.enum(["admin", "member"]);

export const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(80).trim(),
});

export const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
});

export const searchUsersQuerySchema = z.object({
  q: z.string().min(1).max(100).trim(),
});

export const createDmSchema = z.object({
  userId: z.string().uuid(),
});

export const createGroupSchema = z.object({
  name: z.string().min(1).max(80).trim(),
  memberIds: z.array(z.string().uuid()).max(50).default([]),
});

export const addMemberSchema = z.object({
  userId: z.string().uuid(),
});

export const renameGroupSchema = z.object({
  name: z.string().min(1).max(80).trim(),
});

export const messageSendSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().min(1).max(8000),
  clientMsgId: z.string().uuid(),
});

export const messageDeleteSchema = z.object({
  messageId: z.string().uuid(),
});

export const typingSchema = z.object({
  conversationId: z.string().uuid(),
});

export const receiptReadSchema = z.object({
  conversationId: z.string().uuid(),
});

export const paginationQuerySchema = z.object({
  before: z.string().datetime().optional(),
  after: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateDmInput = z.infer<typeof createDmSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type MessageSendInput = z.infer<typeof messageSendSchema>;
