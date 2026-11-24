import { describe, expect, test } from "vitest";
import { PRODUCT_NAME } from "~/lib/brand";
import { sectionTitleForPath } from "../pageTitle";

describe("sectionTitleForPath", () => {
  test.each([
    ["/w/clear/pages/cmworbprz003kl308foyr0yrt", "Pages"],
    ["/w/clear/projects", "Projects"],
    ["/w/clear/crm/contacts", "Contacts"],
    ["/w/clear/crm/contacts/abc123", "Contacts"],
    ["/w/clear/crm/pipeline/settings", "Pipeline settings"],
    ["/w/clear/knowledge-base", "Knowledge"],
    ["/w/clear", "Home"],
    ["/today", "Today"],
    ["/settings/api-keys", "API keys"],
  ])("%s → %s", (path, title) => {
    expect(sectionTitleForPath(path)).toBe(title);
  });

  test("leaves routes that set their own metadata title alone", () => {
    expect(sectionTitleForPath("/docs/getting-started")).toBeNull();
    expect(sectionTitleForPath("/privacy")).toBeNull();
    expect(sectionTitleForPath("/welcome/menu")).toBeNull();
  });

  test("names an unknown route after the product, so no stale name lingers", () => {
    expect(sectionTitleForPath("/not-a-route")).toBe(PRODUCT_NAME);
    expect(sectionTitleForPath("/w/clear/not-a-route")).toBe(PRODUCT_NAME);
  });

  test("doesn't match a key against a longer segment", () => {
    // "products-grid" must not fall back to "products" by string prefix.
    expect(sectionTitleForPath("/w/clear/projects-tasks")).toBe("Tasks");
  });
});
