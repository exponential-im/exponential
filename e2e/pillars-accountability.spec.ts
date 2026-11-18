/**
 * Pillars V3 (ADR-0085, ticket teal.vault): accountability, recurring duties
 * and nudges on a Pillar. Positions are shown as who to ask; nothing is routed
 * through them.
 *
 * Runs as the fixture user (an owner of the dev-fixture workspace). Each run
 * seeds its own Pillar, Position and rows with a unique suffix and deletes
 * exactly those rows afterwards, by the literal ids it created.
 * See dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";
import { loadDevEnvOrThrow } from "../scripts/dev-fixture/env";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();
const FIRST_PAINT_TIMEOUT = 90_000;
const RUN = Date.now().toString(36);

const names = {
  pillar: `E2E Infra ${RUN}`,
  position: `E2E Technical Director ${RUN}`,
};

interface Seeded {
  pillarId: string;
  positionId: string;
}

test.describe("Pillar accountability", () => {
  test.describe.configure({ mode: "serial" });

  let db: PrismaClient;
  let seeded: Seeded;

  test.beforeAll(async () => {
    loadDevEnvOrThrow();
    const prisma = await import("@prisma/client");
    db = new prisma.PrismaClient();
    const workspace = await db.workspace.findUniqueOrThrow({ where: { slug: fixture.workspaceSlug } });
    const membership = await db.workspaceUser.findUniqueOrThrow({
      where: { userId_workspaceId: { userId: fixture.userId, workspaceId: workspace.id } },
    });

    const pillar = await db.tag.create({
      data: {
        name: names.pillar,
        slug: `e2e-infra-${RUN}`,
        color: "avatar-blue",
        category: "pillar",
        workspaceId: workspace.id,
        createdById: fixture.userId,
      },
    });
    const position = await db.position.create({
      data: {
        workspaceId: workspace.id,
        title: names.position,
        remit: "Keeps production running.",
        holders: { create: { workspaceUserId: membership.id } },
      },
    });
    seeded = { pillarId: pillar.id, positionId: position.id };
  });

  test.afterAll(async () => {
    if (seeded) {
      await db.position.delete({ where: { id: seeded.positionId } });
      await db.tag.delete({ where: { id: seeded.pillarId } });
    }
    await db?.$disconnect();
  });

  test("a Pillar with no Position is flagged; adding one shows it with its holder", async ({ page }) => {
    await page.goto(`/w/${fixture.workspaceSlug}/pillars/${seeded.pillarId}`);
    const accountable = page.getByRole("region", { name: "Accountable" });
    await expect(accountable.getByText("No one accountable")).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

    await page.goto(`/w/${fixture.workspaceSlug}/settings?section=pillars`);
    const row = page.getByLabel(`Pillar ${names.pillar}`);
    await expect(row).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    await row.getByRole("textbox", { name: "Accountable Positions" }).click();
    await page.getByRole("option", { name: names.position }).click();
    await expect
      .poll(() => db.pillarPosition.count({ where: { tagId: seeded.pillarId } }))
      .toBe(1);

    await page.goto(`/w/${fixture.workspaceSlug}/pillars/${seeded.pillarId}`);
    await expect(accountable.getByText(names.position)).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    await expect(accountable.getByText("No one accountable")).toHaveCount(0);
    await expect(accountable.getByText("Dev Fixture")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("pillar-accountable.png"), fullPage: true });
  });
});
