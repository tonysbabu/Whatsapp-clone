import type { Prisma } from "@prisma/client";

export type MessagePageQuery = {
  after?: string;
  afterId?: string;
  before?: string;
  beforeId?: string;
  limit: number;
};

export function messagePageArgs(parsed: MessagePageQuery): {
  whereExtra: Prisma.MessageWhereInput;
  orderBy: Prisma.MessageOrderByWithRelationInput[];
  reverse: boolean;
} {
  if (parsed.after) {
    const createdAt = new Date(parsed.after);
    const whereExtra: Prisma.MessageWhereInput = parsed.afterId
      ? {
          OR: [
            { createdAt: { gt: createdAt } },
            { AND: [{ createdAt }, { id: { gt: parsed.afterId } }] },
          ],
        }
      : { createdAt: { gt: createdAt } };
    return {
      whereExtra,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      reverse: false,
    };
  }

  if (parsed.before) {
    const createdAt = new Date(parsed.before);
    const whereExtra: Prisma.MessageWhereInput = parsed.beforeId
      ? {
          OR: [
            { createdAt: { lt: createdAt } },
            { AND: [{ createdAt }, { id: { lt: parsed.beforeId } }] },
          ],
        }
      : { createdAt: { lt: createdAt } };
    return {
      whereExtra,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      reverse: true,
    };
  }

  return {
    whereExtra: {},
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    reverse: true,
  };
}
