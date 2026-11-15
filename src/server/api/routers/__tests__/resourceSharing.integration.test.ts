/**
 * Filing shares (ADR-0082), against a real database: the visibility rule is a
 * relation filter three joins deep in Prisma and an EXISTS in the Knowledge
 * search's SQL, and a mocked client cannot say whether either admits the
 * right rows. Every case here is one person looking for another's Resource.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import {
  addProjectMember,
  addTeamMember,
  addWorkspaceMember,
  createProject,
  createTeam,
  createUser,
  createWorkspace,
} from "~/test/factories";
import { KnowledgeService } from "~/server/services/KnowledgeService";

// `resource.create` schedules its slow work with `after()`, which needs a
// request scope. Nothing here indexes on save, so the callback is dropped.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  after: vi.fn(),
}));

const EMBEDDING = Array.from({ length: 1536 }, () => 0.01);

describe("Resources filed under a Project are shared with it", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
    vi.spyOn(KnowledgeService.prototype, "generateEmbedding").mockResolvedValue(EMBEDDING);
  });

  /** A workspace with an owner, a member, and an open Project the owner filed a page under. */
  async function setup(project: { isRestricted?: boolean; isPublic?: boolean } = {}) {
    const owner = await createUser(db, { name: "Owner" });
    const member = await createUser(db, { name: "Member" });
    const ws = await createWorkspace(db, { ownerId: owner.id });
    await addWorkspaceMember(db, ws.id, member.id);
    const proj = await createProject(db, { createdById: owner.id, workspaceId: ws.id, ...project });
    const { resource } = await createTestCaller(owner.id).resource.create({
      title: "Villa in Lanzarote",
      url: `https://example.com/rooms/${randomUUID()}`,
      pageText: "Villa in Lanzarote, 1,240 total, free cancellation",
      projectId: proj.id,
      generateEmbeddings: false,
      forReference: true,
    });
    return { owner, member, ws, proj, resource };
  }

  /** Index one chunk for a Resource, as an embed would, without calling a model. */
  async function indexChunk(resource: { id: string; userId: string; projectId: string | null; workspaceId: string | null }) {
    await db.$executeRaw`
      INSERT INTO "KnowledgeChunk" (id, content, embedding, "sourceType", "sourceId", "chunkIndex", "userId", "projectId", "workspaceId")
      VALUES (${randomUUID()}, 'free cancellation', ${`[${EMBEDDING.join(",")}]`}::vector, 'resource', ${resource.id}, 0, ${resource.userId}, ${resource.projectId}, ${resource.workspaceId})`;
  }

  async function searchHits(userId: string, workspaceId: string): Promise<string[]> {
    const { results } = await createTestCaller(userId).resource.search({ query: "cancellation", workspaceId });
    return results.map((result) => result.sourceId);
  }

  it("filing puts the Resource in the Project's workspace, whatever workspace was named", async () => {
    const { owner, ws, proj } = await setup();
    const elsewhere = await createWorkspace(db, { ownerId: owner.id });

    const { resource } = await createTestCaller(owner.id).resource.create({
      title: "Filed",
      url: `https://example.com/${randomUUID()}`,
      projectId: proj.id,
      workspaceId: elsewhere.id,
      generateEmbeddings: false,
    });

    expect(resource.workspaceId).toBe(ws.id);
  });

  it("a member who can see the Project lists, opens and finds a Resource another member filed there", async () => {
    const { member, ws, proj, resource } = await setup();
    await indexChunk(resource);
    const caller = createTestCaller(member.id);

    const listed = await caller.resource.list({ projectId: proj.id });
    expect(listed.resources).toHaveLength(1);
    expect(listed.resources[0]).toMatchObject({
      id: resource.id,
      isMine: false,
      owner: { name: "Owner" },
      // Read state is the owner's alone.
      readStatus: null,
      readAt: null,
    });

    const opened = await caller.resource.get({ id: resource.id });
    expect(opened.resource).toMatchObject({ id: resource.id, isMine: false, readStatus: null });
    expect(opened.resource).not.toHaveProperty("pageText");

    const identities = await caller.resource.identities();
    expect(identities.items).toEqual([
      expect.objectContaining({ id: resource.id, isMine: false, readStatus: null, project: { id: proj.id, name: proj.name } }),
    ]);

    expect(await searchHits(member.id, ws.id)).toEqual([resource.id]);
  });

  it("a shared Resource is on its owner's Reading list only", async () => {
    const { owner, member, ws, proj } = await setup();
    await createTestCaller(owner.id).resource.create({
      title: "Queued",
      url: `https://example.com/${randomUUID()}`,
      projectId: proj.id,
      generateEmbeddings: false,
    });

    const mine = await createTestCaller(owner.id).resource.list({ readStatus: "unread", workspaceId: ws.id });
    expect(mine.resources.map((r) => r.title)).toEqual(["Queued"]);

    const caller = createTestCaller(member.id);
    expect((await caller.resource.list({ readStatus: "unread", workspaceId: ws.id })).resources).toEqual([]);
    expect((await caller.resource.list({ readStatus: "unread", projectId: proj.id })).resources).toEqual([]);
    expect((await caller.resource.list({ readStatus: "read", projectId: proj.id })).resources).toEqual([]);
    // Nor on their Knowledge page, which is their own Resources.
    expect((await caller.resource.list({ workspaceId: ws.id })).resources).toEqual([]);
  });

  it("a workspace member who cannot see a restricted Project cannot list, open or find its Resources", async () => {
    const { member, ws, proj, resource } = await setup({ isRestricted: true });
    await indexChunk(resource);
    const caller = createTestCaller(member.id);

    await expect(caller.resource.list({ projectId: proj.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.resource.get({ id: resource.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await caller.resource.identities()).items).toEqual([]);
    expect(await searchHits(member.id, ws.id)).toEqual([]);
  });

  it("a member added to a restricted Project sees what is filed there", async () => {
    const { member, ws, proj, resource } = await setup({ isRestricted: true });
    await indexChunk(resource);
    await addProjectMember(db, proj.id, member.id, "viewer");
    const caller = createTestCaller(member.id);

    expect((await caller.resource.list({ projectId: proj.id })).resources.map((r) => r.id)).toEqual([resource.id]);
    expect((await caller.resource.get({ id: resource.id })).resource.id).toBe(resource.id);
    expect(await searchHits(member.id, ws.id)).toEqual([resource.id]);
  });

  it("a Resource with no Project is invisible to everyone but its owner", async () => {
    const { owner, member, ws } = await setup();
    const { resource: unfiled } = await createTestCaller(owner.id).resource.create({
      title: "Private",
      url: `https://example.com/${randomUUID()}`,
      workspaceId: ws.id,
      generateEmbeddings: false,
    });
    await indexChunk(unfiled);
    const caller = createTestCaller(member.id);

    await expect(caller.resource.get({ id: unfiled.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await caller.resource.list({ workspaceId: ws.id })).resources).toEqual([]);
    expect((await caller.resource.identities()).items.map((item) => item.id)).not.toContain(unfiled.id);
    expect(await searchHits(member.id, ws.id)).not.toContain(unfiled.id);
    // The owner still finds it.
    expect(await searchHits(owner.id, ws.id)).toContain(unfiled.id);
  });

  it("someone who can merely read a public Project is not shown what its members filed", async () => {
    const { ws, proj, resource } = await setup({ isPublic: true });
    await indexChunk(resource);
    const stranger = await createUser(db, { name: "Stranger" });
    const caller = createTestCaller(stranger.id);

    expect((await caller.resource.list({ projectId: proj.id })).resources).toEqual([]);
    await expect(caller.resource.get({ id: resource.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await caller.resource.identities()).items).toEqual([]);
    await expect(caller.resource.search({ query: "cancellation", workspaceId: ws.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("a non-owner cannot describe, move, archive, delete, pin, re-index or change the read state of a shared Resource", async () => {
    const { member, proj, resource } = await setup();
    const other = await createProject(db, { createdById: member.id, workspaceId: resource.workspaceId! });
    const caller = createTestCaller(member.id);
    const notFound = { code: "NOT_FOUND" };

    await expect(caller.resource.update({ id: resource.id, description: "mine now" })).rejects.toMatchObject(notFound);
    await expect(caller.resource.update({ id: resource.id, projectId: other.id })).rejects.toMatchObject(notFound);
    await expect(caller.resource.archive({ id: resource.id })).rejects.toMatchObject(notFound);
    await expect(caller.resource.unarchive({ id: resource.id })).rejects.toMatchObject(notFound);
    await expect(caller.resource.delete({ id: resource.id })).rejects.toMatchObject(notFound);
    await expect(caller.resource.setPinned({ id: resource.id, pinned: true })).rejects.toMatchObject(notFound);
    await expect(caller.resource.regenerateEmbeddings({ id: resource.id })).rejects.toMatchObject(notFound);
    await expect(caller.resource.setReadStatus({ id: resource.id, readStatus: "to_read" })).rejects.toMatchObject(notFound);

    const row = await db.resource.findUniqueOrThrow({ where: { id: resource.id } });
    expect(row).toMatchObject({
      description: null,
      projectId: proj.id,
      archivedAt: null,
      pinnedAsContext: false,
      readStatus: "read",
    });
  });

  it("when the owner leaves the workspace, their Resources stop being visible through its Projects", async () => {
    const { owner, member, ws, proj, resource } = await setup();
    await indexChunk(resource);
    // The workspace passes to the member, and the person who filed the page leaves.
    await db.workspaceUser.update({
      where: { userId_workspaceId: { userId: member.id, workspaceId: ws.id } },
      data: { role: "owner" },
    });
    await db.workspaceUser.delete({ where: { userId_workspaceId: { userId: owner.id, workspaceId: ws.id } } });
    const caller = createTestCaller(member.id);

    expect((await caller.resource.list({ projectId: proj.id })).resources).toEqual([]);
    await expect(caller.resource.get({ id: resource.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await caller.resource.identities()).items).toEqual([]);
    expect(await searchHits(member.id, ws.id)).toEqual([]);
  });

  it("an owner who belongs to the workspace through a team still shares", async () => {
    const { owner, member, ws, proj, resource } = await setup();
    await indexChunk(resource);
    const team = await createTeam(db);
    await db.team.update({ where: { id: team.id }, data: { workspaceId: ws.id } });
    await addTeamMember(db, team.id, owner.id);
    await db.workspaceUser.update({
      where: { userId_workspaceId: { userId: member.id, workspaceId: ws.id } },
      data: { role: "owner" },
    });
    await db.workspaceUser.delete({ where: { userId_workspaceId: { userId: owner.id, workspaceId: ws.id } } });
    const caller = createTestCaller(member.id);

    expect((await caller.resource.list({ projectId: proj.id })).resources.map((r) => r.id)).toEqual([resource.id]);
    expect(await searchHits(member.id, ws.id)).toEqual([resource.id]);
  });

  it("moving a Resource into a Project in another workspace takes its index entries with it", async () => {
    const { owner, member, ws, proj } = await setup();
    const personal = await createWorkspace(db, { ownerId: owner.id });
    const caller = createTestCaller(owner.id);
    const { resource: unfiled } = await caller.resource.create({
      title: "Saved at home",
      url: `https://example.com/${randomUUID()}`,
      workspaceId: personal.id,
      generateEmbeddings: false,
    });
    await indexChunk(unfiled);
    expect(await searchHits(member.id, ws.id)).not.toContain(unfiled.id);

    const moved = await caller.resource.update({ id: unfiled.id, projectId: proj.id });

    expect(moved.resource.workspaceId).toBe(ws.id);
    expect(await searchHits(member.id, ws.id)).toContain(unfiled.id);
    expect(await searchHits(owner.id, personal.id)).not.toContain(unfiled.id);
  });
});
