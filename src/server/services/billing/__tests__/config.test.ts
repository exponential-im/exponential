/**
 * `BILLING_MODE` is the one switch that turns metering and limits on. A
 * self-hosted install sets nothing and must resolve to "off"; a typo must
 * never switch limits on.
 */

import { describe, expect, it } from "vitest";
import { isMeteringOn, resolveBillingMode } from "../config";

describe("resolveBillingMode", () => {
  it("is off when nothing is set, which is how a self-hosted install runs", () => {
    expect(resolveBillingMode({})).toBe("off");
    expect(resolveBillingMode({ BILLING_MODE: "" })).toBe("off");
  });

  it("reads meter and enforce, ignoring case and surrounding spaces", () => {
    expect(resolveBillingMode({ BILLING_MODE: "meter" })).toBe("meter");
    expect(resolveBillingMode({ BILLING_MODE: " Enforce " })).toBe("enforce");
  });

  it("treats a value it does not know as off, never as a limit", () => {
    expect(resolveBillingMode({ BILLING_MODE: "enforced" })).toBe("off");
    expect(resolveBillingMode({ BILLING_MODE: "true" })).toBe("off");
  });
});

describe("isMeteringOn", () => {
  it("records usage in meter and enforce, and not when off", () => {
    expect(isMeteringOn("off")).toBe(false);
    expect(isMeteringOn("meter")).toBe(true);
    expect(isMeteringOn("enforce")).toBe(true);
  });
});
