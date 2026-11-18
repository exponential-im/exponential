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
  recurring: `E2E check backups ${RUN}`,
  oldProject: `E2E Exponential GTM ${RUN}`,
};

interface Seeded {
  pillarId: string;
  positionId: string;
  recurringTaskId: string;
  oldProjectId: string;
  oldProjectSlug: string;
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
    // The app has no recurring-task editor; tasks come from the API.
    const recurring = await db.recurringTask.create({
      data: {
        name: names.recurring,
        repeatPattern: "weekly",
        repeatDays: [1],
        startDate: new Date(),
        workspaceId: workspace.id,
        createdById: fixture.userId,
      },
    });
    // An active project with no end date, started 120 days ago.
    const oldProjectSlug = `e2e-gtm-${RUN}`;
    const oldProject = await db.project.create({
      data: {
        name: names.oldProject,
        slug: oldProjectSlug,
        status: "ACTIVE",
        createdById: fixture.userId,
        workspaceId: workspace.id,
        createdAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000),
      },
    });
    seeded = {
      pillarId: pillar.id,
      positionId: position.id,
      recurringTaskId: recurring.id,
      oldProjectId: oldProject.id,
      oldProjectSlug,
    };
  });

  test.afterAll(async () => {
    if (seeded) {
      await db.position.delete({ where: { id: seeded.positionId } });
      await db.recurringTask.delete({ where: { id: seeded.recurringTaskId } });
      await db.project.delete({ where: { id: seeded.oldProjectId } });
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

  test("a recurring task filed under the Pillar shows under its recurring duties", async ({ page }) => {
    const response = await page.request.post("/api/trpc/tag.setEntityTags", {
      data: { json: { entityType: "recurringTask", entityId: seeded.recurringTaskId, tagIds: [seeded.pillarId] } },
    });
    expect(response.ok(), await response.text()).toBe(true);

    await page.goto(`/w/${fixture.workspaceSlug}/pillars/${seeded.pillarId}`);
    const duties = page.getByRole("region", { name: "Recurring duties" });
    await expect(duties.getByText(names.recurring)).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    await expect(duties.getByText("Every week on Mon")).toBeVisible();
  });

  test("a long-running project with no end date suggests it may be a Pillar, until dismissed", async ({ page }) => {
    await page.goto(`/w/${fixture.workspaceSlug}/projects/${seeded.oldProjectSlug}-${seeded.oldProjectId}`);
    const hint = page.getByRole("note", { name: "This project may be a Pillar" });
    await expect(hint).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    await expect(hint.getByRole("link", { name: "Set up a Pillar" })).toHaveAttribute(
      "href",
      `/w/${fixture.workspaceSlug}/settings?section=pillars`,
    );
    await page.screenshot({ path: test.info().outputPath("looks-ongoing-hint.png"), fullPage: true });

    await hint.getByRole("button", { name: "Dismiss" }).click();
    await expect(hint).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: names.oldProject })).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    await expect(page.getByRole("note", { name: "This project may be a Pillar" })).toHaveCount(0);
  });
});
