/**
 * Pillars V1 (ADR-0085, ticket smooth.quill): a workspace tag promoted to a
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
};

interface Seeded {
  tagId: string;
  projectId: string;
  projectSlug: string;
  actionId: string;
  ticketId: string;
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
    seeded = { tagId: tag.id, projectId: project.id, projectSlug, actionId: action.id, ticketId: ticket.id };
  });

  test.afterAll(async () => {
    if (seeded) {
      await db.ticket.delete({ where: { id: seeded.ticketId } });
      await db.action.delete({ where: { id: seeded.actionId } });
      await db.project.delete({ where: { id: seeded.projectId } });
      await db.tag.delete({ where: { id: seeded.tagId } });
    }
    await db?.$disconnect();
  });

  test("a promoted tag gets a page listing its project, the project's work and the tagged ticket", async ({
    page,
  }) => {
    await trpc(page.request, "tag.setPillar", { tagId: seeded.tagId, isPillar: true });

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
});
