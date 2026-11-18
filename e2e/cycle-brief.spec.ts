/**
 * Cycle brief tracer bullet (ADR-0085), end to end in the browser: the team
 * drafts an outcome on the cycle page, the Product owner reviews and signs it
 * off, and an anonymous visitor sees it on the product's public brief URL
 * with its live status. A rewording stays private until the next sign-off.
 *
 * The fixture user owns the fixture workspace; this spec makes them the
 * fixture product's Product owner and gives the product its own ACTIVE cycle,
 * then removes both.
 */
import { test, expect } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";
import { loadDevEnvOrThrow } from "../scripts/dev-fixture/env";
import { loadFixture } from "./fixture-data";

loadDevEnvOrThrow();
test.describe.configure({ mode: "serial" });

const fixture = loadFixture();
const FIRST_PAINT_TIMEOUT = 60_000;
const CYCLE_SLUG = "e2e-cycle-brief";

let db: PrismaClient;
let productId: string;
let cycleId: string;

test.beforeAll(async () => {
  const { PrismaClient: Client } = await import("@prisma/client");
  db = new Client();
  const workspace = await db.workspace.findUniqueOrThrow({ where: { slug: fixture.workspaceSlug } });
  const product = await db.product.findUniqueOrThrow({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: fixture.productSlug } },
  });
  productId = product.id;
  // Clean up by the stable slug, never by a captured id (a stale run may have left it).
  await db.list.deleteMany({ where: { workspaceId: workspace.id, slug: CYCLE_SLUG } });
  const cycle = await db.list.create({
    data: {
      workspaceId: workspace.id,
      productId: product.id,
      createdById: fixture.userId,
      name: "E2E Brief Cycle",
      slug: CYCLE_SLUG,
      listType: "SPRINT",
      status: "ACTIVE",
      startDate: new Date(Date.now() - 3 * 86_400_000),
      endDate: new Date(Date.now() + 11 * 86_400_000),
    },
  });
  cycleId = cycle.id;
  await db.productOwner.upsert({
    where: { productId_userId: { productId: product.id, userId: fixture.userId } },
    create: { productId: product.id, userId: fixture.userId },
    update: {},
  });
});

test.afterAll(async () => {
  const workspace = await db.workspace.findUniqueOrThrow({ where: { slug: fixture.workspaceSlug } });
  await db.list.deleteMany({ where: { workspaceId: workspace.id, slug: CYCLE_SLUG } });
  await db.productOwner.deleteMany({ where: { productId, userId: fixture.userId } });
  await db.$disconnect();
});

test("a signed-off brief goes public with its live status; a rewording waits for sign-off", async ({
  page,
  browser,
}) => {
  const cycleUrl = `/w/${fixture.workspaceSlug}/products/${fixture.productSlug}/cycles/${cycleId}`;
  const publicUrl = `/briefs/${fixture.workspaceSlug}/${fixture.productSlug}/${CYCLE_SLUG}`;

  await page.goto(cycleUrl);
  await page.getByRole("button", { name: "Start the brief" }).click({ timeout: FIRST_PAINT_TIMEOUT });
  await page.getByRole("button", { name: "Add outcome" }).click();
  await page.getByLabel("Outcome", { exact: true }).fill("The pilot team uses the app every week");
  await page.getByPlaceholder("Why this matters to readers").fill("Their usage decides where we go next");
  await page.getByRole("button", { name: "Add outcome" }).click();
  await expect(page.getByText("The pilot team uses the app every week")).toBeVisible();

  // The public page does not exist before sign-off.
  const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const visitor = await anon.newPage();
  const before = await visitor.goto(publicUrl);
  expect(before?.status()).toBe(404);

  await page.getByRole("button", { name: "Review and publish" }).click();
  await expect(page.getByText("Review and publish the plan")).toBeVisible();
  await page.getByRole("button", { name: "Sign off and publish", exact: true }).click();
  await expect(page.getByText(/Signed off/)).toBeVisible();

  await page.getByRole("textbox", { name: "Weekly status" }).click();
  await page.getByRole("option", { name: "At risk" }).click();
  await expect(page.getByText(/as of .* public at once/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("editor.png"), fullPage: true });

  await visitor.goto(publicUrl);
  await expect(visitor.getByText("The pilot team uses the app every week")).toBeVisible();
  await expect(visitor.getByText("At risk")).toBeVisible();
  await expect(visitor.getByText(/as of/)).toBeVisible();
  await visitor.screenshot({ path: test.info().outputPath("public.png"), fullPage: true });

  // Reword: the public page keeps the signed-off wording until the next sign-off.
  await page.getByRole("button", { name: "Edit", exact: true }).last().click();
  await page.getByLabel("Outcome", { exact: true }).fill("The pilot team uses the app twice a week");
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(page.getByText("Change waits for sign-off")).toBeVisible();
  await visitor.reload();
  await expect(visitor.getByText("The pilot team uses the app every week")).toBeVisible();

  await page.getByRole("button", { name: "Review and sign off changes" }).click();
  await expect(page.getByText("Public now")).toBeVisible();
  await page.getByRole("button", { name: "Sign off changes", exact: true }).click();
  await expect(page.getByText("Change waits for sign-off")).toHaveCount(0);
  await visitor.reload();
  await expect(visitor.getByText("The pilot team uses the app twice a week")).toBeVisible();
  await expect(visitor.getByText(/Changed on/)).toBeVisible();

  const index = await visitor.goto(`/briefs/${fixture.workspaceSlug}/${fixture.productSlug}`);
  expect(index?.status()).toBe(200);
  await expect(visitor.getByRole("link", { name: "E2E Brief Cycle" })).toBeVisible();
  await visitor.screenshot({ path: test.info().outputPath("index.png"), fullPage: true });
  await anon.close();
});
