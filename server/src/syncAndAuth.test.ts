import { describe, expect, it } from "vitest";
import { isCompleteMessageDTO, isPermanentSendFailure } from "@whatsapp/shared";
import { messagePageArgs } from "./messagePaging.js";

describe("isCompleteMessageDTO", () => {
  it("rejects a socket ack that only contains an id", () => {
    expect(isCompleteMessageDTO({ id: "msg-1" })).toBe(false);
  });

  it("accepts a full message DTO", () => {
    expect(
      isCompleteMessageDTO({
        id: "11111111-1111-4111-8111-111111111111",
        conversationId: "22222222-2222-4222-8222-222222222222",
        senderId: "33333333-3333-4333-8333-333333333333",
        body: "hello",
        clientMsgId: "44444444-4444-4444-8444-444444444444",
        createdAt: "2026-01-01T00:00:00.000Z",
        deletedAt: null,
      }),
    ).toBe(true);
  });
});

describe("isPermanentSendFailure", () => {
  it("treats membership and validation errors as permanent", () => {
    expect(isPermanentSendFailure(403)).toBe(true);
    expect(isPermanentSendFailure(400)).toBe(true);
    expect(isPermanentSendFailure(429)).toBe(false);
    expect(isPermanentSendFailure(undefined)).toBe(false);
  });
});

describe("messagePageArgs", () => {
  const createdAt = "2026-01-01T00:00:00.000Z";
  const id = "11111111-1111-4111-8111-111111111111";

  it("pages after a timestamp with an id tie-breaker", () => {
    const { whereExtra, orderBy, reverse } = messagePageArgs({
      after: createdAt,
      afterId: id,
      limit: 50,
    });
    expect(reverse).toBe(false);
    expect(orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
    expect(whereExtra).toEqual({
      OR: [
        { createdAt: { gt: new Date(createdAt) } },
        { AND: [{ createdAt: new Date(createdAt) }, { id: { gt: id } }] },
      ],
    });
  });

  it("pages before a timestamp with an id tie-breaker", () => {
    const { whereExtra, reverse } = messagePageArgs({
      before: createdAt,
      beforeId: id,
      limit: 50,
    });
    expect(reverse).toBe(true);
    expect(whereExtra).toEqual({
      OR: [
        { createdAt: { lt: new Date(createdAt) } },
        { AND: [{ createdAt: new Date(createdAt) }, { id: { lt: id } }] },
      ],
    });
  });
});
