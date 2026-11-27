import type { Prisma } from "@prisma/client";

/**
 * The links a decision list groups by (ticket 1004): scope, feature and
 * ticket, with the names a group header shows. Actions are left out — they
 * never decide a group.
 */
export const decisionGroupLinksSelect = {
  where: { actionId: null },
  select: {
    scope: {
      select: {
        id: true,
        version: true,
        description: true,
        feature: { select: { id: true, name: true } },
      },
    },
    feature: { select: { id: true, name: true } },
    ticket: { select: { id: true, number: true, shortId: true, title: true } },
  },
  orderBy: { createdAt: "asc" },
} satisfies Prisma.Decision$linksArgs;
