import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

const getWorkspaceMembership = vi.hoisted(() => vi.fn());
vi.mock("~/server/services/access", () => ({ getWorkspaceMembership }));

import {
  resolveInstallReturnPath,
  workspaceIdFromInstallState,
} from "../installReturn";

const db = mockDeep<PrismaClient>();

function stateFor(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

beforeEach(() => {
  mockReset(db);
  getWorkspaceMembership.mockReset();
});

describe("workspaceIdFromInstallState", () => {
  it("reads the workspace the install was started from", () => {
    expect(workspaceIdFromInstallState(stateFor({ workspaceId: "ws_1" }))).toBe(
      "ws_1",
    );
  });

  it("is null for a missing, unparseable or workspace-less state", () => {
    expect(workspaceIdFromInstallState(null)).toBeNull();
    expect(workspaceIdFromInstallState("%%%")).toBeNull();
    expect(workspaceIdFromInstallState(stateFor(null))).toBeNull();
    expect(workspaceIdFromInstallState(stateFor({ projectId: "p_1" }))).toBeNull();
    expect(workspaceIdFromInstallState(stateFor({ workspaceId: 42 }))).toBeNull();
  });
});

describe("resolveInstallReturnPath", () => {
  it("returns the member's workspace GitHub section with the result", async () => {
    getWorkspaceMembership.mockResolvedValue({ role: "admin", workspaceId: "ws_1" });
    db.workspace.findUnique.mockResolvedValue({ slug: "acme" } as never);

    await expect(
      resolveInstallReturnPath(db, stateFor({ workspaceId: "ws_1" }), "u_1", "connected"),
    ).resolves.toBe("/w/acme/settings?section=integrations&github=connected");
    expect(getWorkspaceMembership).toHaveBeenCalledWith(db, "u_1", "ws_1");
  });

  it("returns the section without a result for a repeat hit", async () => {
    getWorkspaceMembership.mockResolvedValue({ role: "member", workspaceId: "ws_1" });
    db.workspace.findUnique.mockResolvedValue({ slug: "acme" } as never);

    await expect(
      resolveInstallReturnPath(db, stateFor({ workspaceId: "ws_1" }), "u_1"),
    ).resolves.toBe("/w/acme/settings?section=integrations");
  });

  it("is null for a workspace the caller cannot open, without loading it", async () => {
    getWorkspaceMembership.mockResolvedValue(null);

    await expect(
      resolveInstallReturnPath(db, stateFor({ workspaceId: "ws_other" }), "u_1", "failed"),
    ).resolves.toBeNull();
    expect(db.workspace.findUnique).not.toHaveBeenCalled();
  });

  it("is null when the state names no workspace, without any lookup", async () => {
    await expect(
      resolveInstallReturnPath(db, stateFor({ projectId: "p_1" }), "u_1", "failed"),
    ).resolves.toBeNull();
    expect(getWorkspaceMembership).not.toHaveBeenCalled();
  });

  it("is null when the workspace no longer exists", async () => {
    getWorkspaceMembership.mockResolvedValue({ role: "member", workspaceId: "ws_1" });
    db.workspace.findUnique.mockResolvedValue(null);

    await expect(
      resolveInstallReturnPath(db, stateFor({ workspaceId: "ws_1" }), "u_1", "failed"),
    ).resolves.toBeNull();
  });
});
