/**
 * Account settings (`/settings/...`) carry no workspace in the URL, so the
 * sidebar's workspace switcher is the only thing saying which workspace the page
 * acts on. Two things went wrong there: picking another workspace left the page
 * for that workspace's home, and a full load always came back in the person's
 * default workspace, so there was no way to keep the page on another one.
 *
 * Runs in a real browser because the behaviour lives in what the unit tests
 * mock: localStorage across a reload and the workspace queries themselves.
 * See dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect, type Page } from "@playwright/test";

const FIRST_PAINT_TIMEOUT = 90_000;
const SETTINGS_URL = "/settings/integrations";
// The fixture user's default workspace and a second one they own.
const DEFAULT_WORKSPACE = "Dev Fixture";
const OTHER_WORKSPACE = "Dev Fixture Other";
// Must match LAST_WORKSPACE_STORAGE_KEY in src/providers/WorkspaceProvider.tsx.
const STORAGE_KEY = "exponential:last-workspace-slug";

/**
 * The sidebar switcher while it shows `name` as the current workspace. Matched
 * by its exact accessible name: the user menu further down the sidebar carries
 * the fixture user's name, which is also "Dev Fixture", after their initials.
 */
function switcherShowing(page: Page, name: string) {
  return page.getByRole("complementary").getByRole("button", { name, exact: true });
}

test("switching workspace on account settings stays on the page and survives a reload", async ({
  page,
}) => {
  await page.goto(SETTINGS_URL);
  await expect(switcherShowing(page, DEFAULT_WORKSPACE)).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });

  await switcherShowing(page, DEFAULT_WORKSPACE).click();
  await page.getByRole("menuitem", { name: OTHER_WORKSPACE }).click();

  await expect(switcherShowing(page, OTHER_WORKSPACE)).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(SETTINGS_URL);

  await page.reload();
  await expect(switcherShowing(page, OTHER_WORKSPACE)).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });
  expect(new URL(page.url()).pathname).toBe(SETTINGS_URL);

  await test.info().attach("settings-in-other-workspace", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});

test("a remembered workspace that no longer exists falls back to the default one", async ({
  page,
}) => {
  await page.addInitScript(
    ([key, slug]) => {
      // Only seed it once, so the provider's own writes are what a reload reads.
      if (!window.sessionStorage.getItem("seeded")) {
        window.localStorage.setItem(key!, slug!);
        window.sessionStorage.setItem("seeded", "1");
      }
    },
    [STORAGE_KEY, "no-such-workspace"],
  );

  await page.goto(SETTINGS_URL);

  await expect(switcherShowing(page, DEFAULT_WORKSPACE)).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });
  expect(new URL(page.url()).pathname).toBe(SETTINGS_URL);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)).toBe(
    "dev-fixture",
  );
});
