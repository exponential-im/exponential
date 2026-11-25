/**
 * Pillars and labels on Decisions (ADR-0086): tag a decision on its page,
 * filter the Decision Log by Pillar and by label, and find the decision on
 * the Pillar's page.
 *
 * Runs as the fixture user (an owner of the dev-fixture workspace). Each run
 * creates its own Pillar, label and two decisions with a unique suffix and
 * deletes exactly those rows afterwards. See dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";
import { loadDevEnvOrThrow } from "../scripts/dev-fixture/env";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();
const FIRST_PAINT_TIMEOUT = 90_000;
const RUN = Date.now().toString(36);

const names = {
  pillar: `E2E Data Quality ${RUN}`,
  label: `e2e-ingest-${RUN}`,
  tagged: `E2E gate ingest on schema checks ${RUN}`,
  untagged: `E2E keep the weekly sync on Mondays ${RUN}`,
};

/** A full-page screenshot kept with the run's output, for a person to look at. */
async function attachScreenshot(page: Page, name: string) {
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true });
}

test.describe("Pillars and labels on Decisions", () => {
  test.describe.configure({ mode: "serial" });

  let db: PrismaClient;
  let seeded: { tagIds: string[]; pillarSlug: string; taggedId: string; untaggedId: string } | undefined;

  test.beforeAll(async () => {
    loadDevEnvOrThrow();
    const prisma = await import("@prisma/client");
    db = new prisma.PrismaClient();
    const workspace = await db.workspace.findUniqueOrThrow({ where: { slug: fixture.workspaceSlug } });

    const pillarSlug = `e2e-data-quality-${RUN}`;
    const pillar = await db.tag.create({
      data: {
        name: names.pillar,
        slug: pillarSlug,
        color: "avatar-teal",
        category: "pillar",
        workspaceId: workspace.id,
        createdById: fixture.userId,
      },
    });
    const label = await db.tag.create({
      data: {
        name: names.label,
        slug: names.label,
        color: "avatar-orange",
        workspaceId: workspace.id,
        createdById: fixture.userId,
      },
    });
    // Past every number the workspace counter hands out, and its own per
    // run: `number` is unique in a workspace, and a run that died before
    // its cleanup leaves its rows behind.
    const firstNumber = 1_000_000 + (Date.now() % 1_000_000_000);
    const decision = (statement: string, offset: number) =>
      db.decision.create({
        data: {
          workspaceId: workspace.id,
          number: firstNumber + offset,
          statement,
          status: "ACCEPTED",
          source: "MANUAL",
          decidedAt: new Date(),
          createdById: fixture.userId,
        },
      });
    const tagged = await decision(names.tagged, 0);
    const untagged = await decision(names.untagged, 1);
    seeded = {
      tagIds: [pillar.id, label.id],
      pillarSlug,
      taggedId: tagged.id,
      untaggedId: untagged.id,
    };
  });

  test.afterAll(async () => {
    if (seeded) {
      await db.decision.deleteMany({ where: { id: { in: [seeded.taggedId, seeded.untaggedId] } } });
      await db.tag.deleteMany({ where: { id: { in: seeded.tagIds } } });
    }
    await db?.$disconnect();
  });

  test("a decision is filed under a Pillar and a label from its page", async ({ page }) => {
    await page.goto(`/w/${fixture.workspaceSlug}/decisions/d/${seeded!.taggedId}`);
    await expect(page.getByRole("heading", { name: names.tagged })).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    });

    await page.getByRole("button", { name: "Add Pillars or labels" }).click();
    const picker = page.locator(".mantine-Popover-dropdown");
    // The two kinds sit in separate groups.
    await expect(picker.getByText("Pillars", { exact: true })).toBeVisible();
    await expect(picker.getByText("Labels", { exact: true })).toBeVisible();
    await picker.getByText(names.pillar, { exact: true }).click();
    await picker.getByText(names.label, { exact: true }).click();
    await picker.getByRole("button", { name: "Save" }).click();

    // The Pillar links to its page; the label is a plain badge.
    await expect(page.getByRole("link", { name: names.pillar })).toHaveAttribute(
      "href",
      `/w/${fixture.workspaceSlug}/pillars/${seeded!.pillarSlug}`,
    );
    await expect(page.getByText(names.label, { exact: true })).toBeVisible();
    await attachScreenshot(page, "decision-with-tags");
  });

  test("the Decision Log filters by Pillar and by label", async ({ page }) => {
    await page.goto(`/w/${fixture.workspaceSlug}/decisions`);
    const taggedRow = page.locator(".dec-row", { hasText: names.tagged });
    const untaggedRow = page.locator(".dec-row", { hasText: names.untagged });
    await expect(taggedRow).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    await expect(untaggedRow).toBeVisible();
    // The tagged row names what it carries.
    await expect(taggedRow).toContainText(names.pillar);
    await expect(taggedRow).toContainText(names.label);

    await page.getByRole("button", { name: "Filter by Pillar" }).click();
    await page.getByRole("menuitem", { name: names.pillar }).click();
    await expect(taggedRow).toBeVisible();
    await expect(untaggedRow).toHaveCount(0);
    // Only decisions carry tags, so nothing synced from git is listed.
    await expect(page.locator('.dec-row[data-kind="decision"]')).toHaveCount(1);
    await expect(page.locator(".dec-row")).toHaveCount(1);
    await attachScreenshot(page, "log-filtered-by-pillar");

    // Both filters together still match the decision that carries both.
    await page.getByRole("button", { name: "Filter by label" }).click();
    await page.getByRole("menuitem", { name: names.label }).click();
    await expect(taggedRow).toBeVisible();

    // Clearing both brings the untagged decision back.
    await page.getByRole("button", { name: "Clear Pillar filter" }).click();
    await page.getByRole("button", { name: "Clear label filter" }).click();
    await expect(untaggedRow).toBeVisible();
  });

  test("the Pillar's page lists the decision filed under it", async ({ page }) => {
    await page.goto(`/w/${fixture.workspaceSlug}/pillars/${seeded!.pillarSlug}`);
    const decisions = page.getByRole("region", { name: "Decisions" });
    await expect(decisions).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    await expect(decisions.getByRole("link", { name: names.tagged })).toHaveAttribute(
      "href",
      `/w/${fixture.workspaceSlug}/decisions/d/${seeded!.taggedId}`,
    );
    await expect(decisions.getByText(names.untagged)).toHaveCount(0);
    await attachScreenshot(page, "pillar-page-decisions");
  });
});
