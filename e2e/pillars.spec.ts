/**
 * Pillars V1 (ADR-0086, ticket smooth.quill): a workspace tag promoted to a
 * Pillar, and the Pillar page that gathers everything filed under it.
 *
 * Runs as the fixture user (an owner of the dev-fixture workspace). Each run
 * creates its own tag, project, action and ticket with a unique suffix and
 * deletes exactly those rows afterwards, by the literal ids it created.
 * See dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";
import { loadDevEnvOrThrow } from "../scripts/dev-fixture/env";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();
const FIRST_PAINT_TIMEOUT = 90_000;
const RUN = Date.now().toString(36);

const names = {
  pillar: `E2E DevOps ${RUN}`,
  project: `E2E Migrate to Railway ${RUN}`,
  projectAction: `E2E untagged action in the project ${RUN}`,
  ticket: `E2E alert on failed backups ${RUN}`,
  goal: `E2E zero unplanned downtime ${RUN}`,
  resource: `E2E incident runbook ${RUN}`,
  epic: `E2E observability ${RUN}`,
  epicTicket: `E2E add tracing to the API ${RUN}`,
  otherEpic: `E2E onboarding revamp ${RUN}`,
  inheritedTicket: `E2E rotate the deploy key ${RUN}`,
  doneAction: `E2E renew the TLS certificate ${RUN}`,
  taggedProjectAction: `E2E tagged action in the tagged project ${RUN}`,
};

interface Seeded {
  tagId: string;
  projectId: string;
  projectSlug: string;
  actionId: string;
  ticketId: string;
  goalId: number;
  resourceId: string;
  epicIds: string[];
  extraTicketIds: string[];
  doneActionId: string;
  taggedProjectActionId: string;
}

async function trpc(request: APIRequestContext, procedure: string, input: unknown) {
  const response = await request.post(`/api/trpc/${procedure}`, { data: { json: input } });
  expect(response.ok(), `${procedure} → ${response.status()} ${await response.text()}`).toBe(true);
}

test.describe("Pillars", () => {
  test.describe.configure({ mode: "serial" });

  let db: PrismaClient;
  let seeded: Seeded;

  test.beforeAll(async () => {
    loadDevEnvOrThrow();
    const prisma = await import("@prisma/client");
    db = new prisma.PrismaClient();

    const workspace = await db.workspace.findUniqueOrThrow({ where: { slug: fixture.workspaceSlug } });
    const product = await db.product.findFirstOrThrow({
      where: { workspaceId: workspace.id, slug: fixture.productSlug },
    });

    const tag = await db.tag.create({
      data: {
        name: names.pillar,
        slug: `e2e-devops-${RUN}`,
        color: "avatar-blue",
        description: "Keep **production** healthy.",
        workspaceId: workspace.id,
        createdById: fixture.userId,
      },
    });
    const projectSlug = `e2e-pillar-project-${RUN}`;
    const project = await db.project.create({
      data: {
        name: names.project,
        slug: projectSlug,
        status: "ACTIVE",
        createdById: fixture.userId,
        workspaceId: workspace.id,
      },
    });
    const action = await db.action.create({
      data: {
        name: names.projectAction,
        projectId: project.id,
        workspaceId: workspace.id,
        createdById: fixture.userId,
        status: "ACTIVE",
        priority: "Quick",
      },
    });
    // A ticket already carrying the tag before it is promoted.
    const ticket = await db.ticket.create({
      data: {
        productId: product.id,
        number: 90_000 + Math.floor(Math.random() * 9_000),
        title: names.ticket,
        createdById: fixture.userId,
        tags: { create: { tagId: tag.id } },
      },
    });
    const goal = await db.goal.create({
      data: { title: names.goal, userId: fixture.userId, workspaceId: workspace.id, status: "active" },
    });
    const resource = await db.resource.create({
      data: {
        title: names.resource,
        userId: fixture.userId,
        workspaceId: workspace.id,
        contentType: "note",
        content: "Restore from the latest snapshot.",
        readStatus: "read",
      },
    });
    // An epic under the Pillar with an untagged ticket; an untagged epic holding a
    // ticket that carries the Pillar itself; a finished loose action.
    const epic = await db.epic.create({
      data: {
        name: names.epic,
        workspaceId: workspace.id,
        productId: product.id,
        ownerId: fixture.userId,
        tags: { create: { tagId: tag.id } },
      },
    });
    const otherEpic = await db.epic.create({
      data: { name: names.otherEpic, workspaceId: workspace.id, productId: product.id, ownerId: fixture.userId },
    });
    const ticketNumber = () => 90_000 + Math.floor(Math.random() * 9_000);
    const epicTicket = await db.ticket.create({
      data: {
        productId: product.id,
        number: ticketNumber(),
        title: names.epicTicket,
        createdById: fixture.userId,
        epicId: epic.id,
      },
    });
    const inheritedTicket = await db.ticket.create({
      data: {
        productId: product.id,
        number: ticketNumber(),
        title: names.inheritedTicket,
        createdById: fixture.userId,
        epicId: otherEpic.id,
        tags: { create: { tagId: tag.id } },
      },
    });
    const doneAction = await db.action.create({
      data: {
        name: names.doneAction,
        workspaceId: workspace.id,
        createdById: fixture.userId,
        status: "COMPLETED",
        priority: "Quick",
        tags: { create: { tagId: tag.id } },
      },
    });
    // Carries the Pillar itself, inside the project that will carry it too.
    const taggedProjectAction = await db.action.create({
      data: {
        name: names.taggedProjectAction,
        projectId: project.id,
        workspaceId: workspace.id,
        createdById: fixture.userId,
        status: "ACTIVE",
        priority: "Quick",
        tags: { create: { tagId: tag.id } },
      },
    });
    seeded = {
      taggedProjectActionId: taggedProjectAction.id,
      epicIds: [epic.id, otherEpic.id],
      extraTicketIds: [epicTicket.id, inheritedTicket.id],
      doneActionId: doneAction.id,
      tagId: tag.id,
      projectId: project.id,
      projectSlug,
      actionId: action.id,
      ticketId: ticket.id,
      goalId: goal.id,
      resourceId: resource.id,
    };
  });

  test.afterAll(async () => {
    if (seeded) {
      await db.ticket.delete({ where: { id: seeded.ticketId } });
      for (const id of seeded.extraTicketIds) await db.ticket.delete({ where: { id } });
      for (const id of seeded.epicIds) await db.epic.delete({ where: { id } });
      await db.action.delete({ where: { id: seeded.doneActionId } });
      await db.action.delete({ where: { id: seeded.taggedProjectActionId } });
      await db.goal.delete({ where: { id: seeded.goalId } });
      await db.resource.delete({ where: { id: seeded.resourceId } });
      await db.action.delete({ where: { id: seeded.actionId } });
      await db.project.delete({ where: { id: seeded.projectId } });
      await db.tag.delete({ where: { id: seeded.tagId } });
    }
    await db?.$disconnect();
  });

  test("a promoted tag gets a page listing its project, the project's work and the tagged ticket", async ({
    page,
  }) => {
    // Promote the existing tag in workspace settings.
    await page.goto(`/w/${fixture.workspaceSlug}/settings?section=pillars`);
    const tagToPromote = page.getByRole("textbox", { name: "Tag to promote" });
    await expect(tagToPromote).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    await tagToPromote.click();
    await page.getByRole("option", { name: names.pillar }).click();
    await page.getByRole("button", { name: "Promote", exact: true }).click();
    await expect(page.getByRole("link", { name: names.pillar })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("settings-pillars.png"), fullPage: true });

    // The sidebar gains a Pillars row, leading to the list of Pillars.
    const sidebarPillars = page.locator("aside.app-sidebar nav").getByRole("link", { name: "Pillars", exact: true });
    await expect(sidebarPillars).toBeVisible();
    await sidebarPillars.click();
    await expect(page.getByRole("heading", { name: "Pillars", level: 1 })).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    });
    await expect(page.getByRole("link", { name: new RegExp(names.pillar) })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("pillars-list.png"), fullPage: true });

    // File the project under the Pillar from the project page.
    await page.goto(`/w/${fixture.workspaceSlug}/projects/${seeded.projectSlug}-${seeded.projectId}`);
    const addPillar = page.getByRole("button", { name: "Add Pillar" });
    await expect(addPillar).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    await addPillar.click();
    // Mantine hides the Chip input itself; the label is what a person clicks.
    await page.locator("label", { hasText: names.pillar }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const pillarLink = page.getByRole("link", { name: names.pillar });
    await expect(pillarLink).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("project-with-pillar.png"), fullPage: true });

    // The Pillar page: the project with its untagged action, and the ticket as loose work.
    await pillarLink.click();
    await expect(page.getByRole("heading", { name: names.pillar, level: 1 })).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    });
    await expect(page.getByText("production")).toBeVisible();
    const projects = page.getByRole("region", { name: "Projects" });
    await expect(projects.getByRole("link", { name: names.project })).toBeVisible();
    await expect(projects.getByRole("link", { name: names.projectAction })).toBeVisible();
    const loose = page.getByRole("region", { name: "Loose work" });
    await expect(loose.getByRole("link", { name: names.ticket })).toBeVisible();
    await expect(loose.getByText("Unassigned")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("pillar-page.png"), fullPage: true });
  });

  test("a goal and a resource filed under the Pillar from their own pages appear on it", async ({ page }) => {
    // The first test promoted the tag; this one runs after it (serial).
    const fileUnder = async (button: string) => {
      const add = page.getByRole("button", { name: button });
      await expect(add).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
      await add.click();
      await page.locator("label", { hasText: names.pillar }).click();
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByRole("link", { name: names.pillar })).toBeVisible();
    };

    await page.goto(`/w/${fixture.workspaceSlug}/goals/${seeded.goalId}`);
    await fileUnder("Add Pillar");
    await page.screenshot({ path: test.info().outputPath("goal-with-pillar.png"), fullPage: true });

    await page.goto(`/w/${fixture.workspaceSlug}/knowledge-base/${seeded.resourceId}`);
    await fileUnder("Add Pillar");

    await page.goto(`/w/${fixture.workspaceSlug}/pillars/${seeded.tagId}`);
    await expect(page.getByRole("heading", { name: names.pillar, level: 1 })).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    });
    await expect(page.getByRole("region", { name: "Goals" }).getByRole("link", { name: names.goal })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Resources" }).getByRole("link", { name: names.resource }),
    ).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("pillar-page-goals-resources.png"), fullPage: true });
  });

  test("epics, work filed from other containers, and finished work behind the toggle", async ({ page }) => {
    await page.goto(`/w/${fixture.workspaceSlug}/pillars/${seeded.tagId}`);
    await expect(page.getByRole("heading", { name: names.pillar, level: 1 })).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    });

    const epics = page.getByRole("region", { name: "Epics" });
    await expect(epics.getByRole("link", { name: names.epic })).toBeVisible();
    await expect(epics.getByRole("link", { name: names.epicTicket })).toBeVisible();

    const inherited = page.getByRole("region", { name: "Filed here from other work" });
    await expect(inherited.getByRole("link", { name: names.inheritedTicket })).toBeVisible();
    await expect(inherited.getByText(`in ${names.otherEpic}`)).toBeVisible();
    // Work carrying the Pillar inside a project that carries it too is listed
    // under the project only, never again here.
    await expect(
      page.getByRole("region", { name: "Projects" }).getByRole("link", { name: names.taggedProjectAction }),
    ).toBeVisible();
    await expect(inherited.getByText(names.taggedProjectAction)).toHaveCount(0);
    // The untagged epic itself is not under the Pillar.
    await expect(epics.getByText(names.otherEpic)).toHaveCount(0);

    const loose = page.getByRole("region", { name: "Loose work" });
    await expect(loose.getByRole("link", { name: names.doneAction })).toHaveCount(0);
    await page.getByText("Show completed", { exact: true }).click();
    await expect(page.getByRole("switch", { name: "Show completed" })).toBeChecked();
    await expect(loose.getByRole("link", { name: names.doneAction })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("pillar-page-complete.png"), fullPage: true });
  });

  test("the ticket label picker lists Pillars as their own group, marked", async ({ page }) => {
    await page.goto(`/w/${fixture.workspaceSlug}/products/${fixture.productSlug}/tickets/${seeded.ticketId}`);
    // The ticket already carries the Pillar: its badge carries the Pillar glyph.
    const badge = page.getByText(names.pillar, { exact: true }).first();
    await expect(badge).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    await expect(page.getByLabel("Pillar").first()).toBeVisible();

    // The Labels property row (the first badge is the header strip).
    // A click before hydration opens nothing; retry until the dropdown shows.
    const listbox = page.getByRole("listbox");
    await expect(async () => {
      await page.getByText(names.pillar, { exact: true }).filter({ visible: true }).last().click();
      await expect(listbox.getByText("Pillars", { exact: true })).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await expect(listbox.getByText("Labels", { exact: true })).toBeVisible();
    await expect(listbox.getByRole("option", { name: names.pillar })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("ticket-label-picker.png"), fullPage: true });
  });

  test("an inactive Pillar keeps its items but leaves the pickers", async ({ page }) => {
    await page.goto(`/w/${fixture.workspaceSlug}/settings?section=pillars`);
    const row = page.getByLabel(`Pillar ${names.pillar}`);
    await expect(row).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    await row.getByRole("button", { name: "Make inactive" }).click();
    await expect(page.getByText("Inactive Pillars")).toBeVisible();

    // The project still carries it, and its page still opens, marked inactive.
    await page.goto(`/w/${fixture.workspaceSlug}/projects/${seeded.projectSlug}-${seeded.projectId}`);
    await expect(page.getByRole("link", { name: names.pillar })).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    await page.goto(`/w/${fixture.workspaceSlug}/pillars/${seeded.tagId}`);
    await expect(page.getByText("Inactive", { exact: true })).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    // With no active Pillar left, the sidebar row goes away.
    await expect(
      page.locator("aside.app-sidebar nav").getByRole("link", { name: "Pillars", exact: true }),
    ).toHaveCount(0);

    await trpc(page.request, "tag.setPillarArchived", { tagId: seeded.tagId, archived: false });
  });

  test("the ticket board groups by Pillar, counting an epic's Pillar for its tickets", async ({ page }) => {
    await page.goto(`/w/${fixture.workspaceSlug}/products/${fixture.productSlug}/tickets?group=pillar`);
    await expect(page.getByText(names.ticket).first()).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    await expect(page.getByText(/No pillar/i).first()).toBeVisible();
    // The Pillar's group holds the ticket carrying it and the one inside the Pillar's epic.
    await expect(page.getByText(names.pillar, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(names.epicTicket).first()).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("ticket-board-by-pillar.png"), fullPage: true });
  });

  test("a Pillar turned back into a label shows on the project as a plain badge", async ({ page }) => {
    await trpc(page.request, "tag.setPillar", { tagId: seeded.tagId, isPillar: false });

    await page.goto(`/w/${fixture.workspaceSlug}/projects/${seeded.projectSlug}-${seeded.projectId}`);
    await expect(page.getByText(names.pillar, { exact: true }).first()).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    });
    // No link to a Pillar page that no longer exists.
    await expect(page.getByRole("link", { name: names.pillar })).toHaveCount(0);
  });
});
