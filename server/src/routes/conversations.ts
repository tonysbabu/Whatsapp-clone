import { Router } from "express";
import { restSendMessageSchema } from "@whatsapp/shared";
import {
  addMember,
  createGroup,
  createOrOpenDm,
  listConversations,
  listMessages,
  loadConversationDTO,
  removeMember,
  renameGroup,
} from "../conversationService.js";
import { ackMessage, broadcastMessage, persistMessage } from "../messageService.js";
import { toMessageDTO } from "../serializers.js";

export const conversationsRouter = Router();

conversationsRouter.get("/", async (req, res, next) => {
  try {
    res.json({ conversations: await listConversations(req.userId) });
  } catch (err) {
    next(err);
  }
});

conversationsRouter.post("/dm", async (req, res, next) => {
  try {
    const { conversation, created } = await createOrOpenDm(req.userId, req.body);
    res.status(created ? 201 : 200).json({ conversation });
  } catch (err) {
    next(err);
  }
});

conversationsRouter.post("/groups", async (req, res, next) => {
  try {
    res.status(201).json({ conversation: await createGroup(req.userId, req.body) });
  } catch (err) {
    next(err);
  }
});

conversationsRouter.get("/:id", async (req, res, next) => {
  try {
    res.json({ conversation: await loadConversationDTO(req.params.id, req.userId) });
  } catch (err) {
    next(err);
  }
});

conversationsRouter.get("/:id/messages", async (req, res, next) => {
  try {
    res.json({ messages: await listMessages(req.params.id, req.userId, req.query) });
  } catch (err) {
    next(err);
  }
});

conversationsRouter.post("/:id/messages", async (req, res, next) => {
  try {
    const { body, clientMsgId } = restSendMessageSchema.parse(req.body);
    const { message, created } = await persistMessage(req.userId, {
      conversationId: req.params.id,
      body,
      clientMsgId,
    });
    broadcastMessage(message, created);
    ackMessage(req.userId, message);
    res.status(created ? 201 : 200).json({ message: toMessageDTO(message) });
  } catch (err) {
    next(err);
  }
});

conversationsRouter.patch("/:id", async (req, res, next) => {
  try {
    res.json({ conversation: await renameGroup(req.params.id, req.userId, req.body) });
  } catch (err) {
    next(err);
  }
});

conversationsRouter.post("/:id/members", async (req, res, next) => {
  try {
    res.status(201).json({ conversation: await addMember(req.params.id, req.userId, req.body) });
  } catch (err) {
    next(err);
  }
});

conversationsRouter.delete("/:id/members/:userId", async (req, res, next) => {
  try {
    await removeMember(req.params.id, req.userId, req.params.userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
