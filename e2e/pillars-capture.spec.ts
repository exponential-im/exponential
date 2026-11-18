/**
 * Pillars V2 (ADR-0085, ticket inner.tiger): capture in the app asks
 * Workspace, then Pillars, then an optional Project, and files what it saves
 * under the ticked Pillars.
 *
 * Runs as the fixture user (an owner of the dev-fixture workspace). Each run
 * seeds its own Pillar and projects with a unique suffix and deletes exactly
 * those rows afterwards, by literal ids or by the unique URL/name it used.
 * See dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect, type Locator } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";
import { loadDevEnvOrThrow } from "../scripts/dev-fixture/env";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();
const FIRST_PAINT_TIMEOUT = 90_000;
const RUN = Date.now().toString(36);

const names = {
  pillar: `E2E Ops ${RUN}`,
  otherPillar: `E2E Growth ${RUN}`,
  pillarProject: `E2E Railway move ${RUN}`,
  otherProject: `E2E Launch week ${RUN}`,
  savedUrl: `https://example.com/e2e-backups-${RUN}`,
  savedHost: "example.com",
  action: `E2E rotate keys ${RUN}`,
};

/** Tick a Pillar chip unless it is ticked already (capture may pre-tick it). */
async function tick(placement: Locator, pillar: string) {
  const chip = placement.getByRole("checkbox", { name: pillar });
  if (!(await chip.isChecked())) await placement.locator("label", { hasText: pillar }).click();
  await expect(chip).toBeChecked();
}

interface Seeded {
  pillarId: string;
  otherPillarId: string;
  projectIds: string[];
}

test.describe("Capture with Pillars", () => {
  test.describe.configure({ mode: "serial" });

  let db: PrismaClient;
  let seeded: Seeded;

  test.beforeAll(async () => {
    loadDevEnvOrThrow();
    const prisma = await import("@prisma/client");
    db = new prisma.PrismaClient();
    const workspace = await db.workspace.findUniqueOrThrow({ where: { slug: fixture.workspaceSlug } });

    const makePillar = (name: string, slug: string) =>
      db.tag.create({
        data: {
          name,
          slug,
          color: "avatar-teal",
          category: "pillar",
          workspaceId: workspace.id,
          createdById: fixture.userId,
        },
      });
    const pillar = await makePillar(names.pillar, `e2e-ops-${RUN}`);
    const otherPillar = await makePillar(names.otherPillar, `e2e-growth-${RUN}`);
    const pillarProject = await db.project.create({
      data: {
        name: names.pillarProject,
        slug: `e2e-railway-${RUN}`,
        status: "ACTIVE",
        createdById: fixture.userId,
        workspaceId: workspace.id,
        pillarTags: { create: { tagId: pillar.id } },
      },
    });
    const otherProject = await db.project.create({
      data: {
        name: names.otherProject,
        slug: `e2e-launch-${RUN}`,
        status: "ACTIVE",
        createdById: fixture.userId,
        workspaceId: workspace.id,
        pillarTags: { create: { tagId: otherPillar.id } },
      },
    });
    seeded = {
      pillarId: pillar.id,
      otherPillarId: otherPillar.id,
      projectIds: [pillarProject.id, otherProject.id],
    };
  });

  test.afterAll(async () => {
    if (seeded) {
      await db.resource.deleteMany({ where: { url: names.savedUrl } });
      await db.action.deleteMany({ where: { name: names.action } });
      for (const id of seeded.projectIds) await db.project.delete({ where: { id } });
      await db.tag.delete({ where: { id: seeded.pillarId } });
      await db.tag.delete({ where: { id: seeded.otherPillarId } });
    }
    await db?.$disconnect();
  });

  test("Save link files a link under a ticked Pillar", async ({ page }) => {
    await page.goto(`/w/${fixture.workspaceSlug}/knowledge-base`);
    const save = page.getByRole("button", { name: "Save", exact: true });
    await expect(save).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    await save.click();

    const placement = page.getByLabel("Where this goes");
    await expect(placement).toBeVisible();
    await tick(placement, names.pillar);
    const input = page.getByPlaceholder("Paste a link, text or markdown and press Enter");
    await input.fill(names.savedUrl);
    await page.screenshot({ path: test.info().outputPath("save-link-with-pillar.png"), fullPage: true });
    await input.press("Enter");
    await expect(input).toBeHidden();

    await expect
      .poll(async () =>
        db.resourceTag.count({ where: { tagId: seeded.pillarId, resource: { url: names.savedUrl } } }),
      )
      .toBe(1);

    await page.goto(`/w/${fixture.workspaceSlug}/pillars/${seeded.pillarId}`);
    await expect(
      page.getByRole("region", { name: "Resources" }).getByRole("link", { name: names.savedHost }),
    ).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  });

  test("ticking a Pillar narrows the projects; choosing a project ticks its Pillars", async ({ page }) => {
    await page.goto(`/w/${fixture.workspaceSlug}/knowledge-base`);
    const save = page.getByRole("button", { name: "Save", exact: true });
    await expect(save).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    await save.click();
    const placement = page.getByLabel("Where this goes");
    const project = placement.getByRole("textbox", { name: "Project" });

    // No Pillar ticked: both projects are offered.
    await project.click();
    await expect(page.getByRole("option", { name: names.pillarProject })).toBeVisible();
    await expect(page.getByRole("option", { name: names.otherProject })).toBeVisible();
    await page.keyboard.press("Escape");

    // Tick the Ops Pillar: only the project under it remains.
    await placement.locator("label", { hasText: names.pillar }).click();
    await project.click();
    await expect(page.getByRole("option", { name: names.pillarProject })).toBeVisible();
    await expect(page.getByRole("option", { name: names.otherProject })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // Untick, then choose the Growth project: its Pillar is ticked for you.
    await placement.locator("label", { hasText: names.pillar }).click();
    await project.click();
    await page.getByRole("option", { name: names.otherProject }).click();
    await expect(placement.getByRole("checkbox", { name: names.otherPillar })).toBeChecked();
    await expect(placement.getByRole("checkbox", { name: names.pillar })).not.toBeChecked();
    await page.screenshot({ path: test.info().outputPath("project-ticks-pillar.png"), fullPage: true });
  });

  test("the Create Action modal asks Pillars then Project, and files under the Pillar", async ({ page }) => {
    await page.goto(`/w/${fixture.workspaceSlug}/pillars/${seeded.pillarId}`);
    await expect(page.getByRole("heading", { name: names.pillar, level: 1 })).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    });
    await page.getByRole("button", { name: /Create Action/i }).first().click();

    const dialog = page.getByRole("dialog");
    const nameBox = dialog.locator('form [contenteditable="true"]').first();
    await expect(nameBox).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    await nameBox.click();
    await page.keyboard.type(names.action);
    const placement = dialog.getByLabel("Where this goes");
    await expect(placement).toBeVisible();
    await tick(placement, names.pillar);
    // The footer's own project picker gives way to the capture row.
    await expect(dialog.getByPlaceholder("Select a project (optional)")).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath("create-action-with-pillar.png"), fullPage: true });
    await dialog.getByRole("button", { name: "New action" }).click();

    await expect
      .poll(async () => db.actionTag.count({ where: { tagId: seeded.pillarId, action: { name: names.action } } }))
      .toBe(1);
    await page.reload();
    await expect(
      page.getByRole("region", { name: "Loose work" }).getByRole("link", { name: names.action }),
    ).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  });
});
