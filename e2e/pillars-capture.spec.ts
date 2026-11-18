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
import { test, expect } from "@playwright/test";
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
    await placement.locator("label", { hasText: names.pillar }).click();
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
});
