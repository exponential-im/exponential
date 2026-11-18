import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "~/test/test-db";
import { createTestCaller, createUnauthenticatedCaller } from "~/test/trpc-helpers";
import { createUser, createWorkspace, createProduct, createCycle, addWorkspaceMember } from "~/test/factories";

/**
 * Cycle briefs (ADR-0085) through the `cycleBrief` router: the team drafts,
 * a Product owner signs off, and only the signed-off version is public.
 */
describe("cycleBrief router", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  async function setup() {
    const owner = await createUser(db, { name: "Olive Owner" });
    const ws = await createWorkspace(db, { ownerId: owner.id });
    const product = await createProduct(db, { workspaceId: ws.id, createdById: owner.id });
    const cycle = await createCycle(db, {
      workspaceId: ws.id,
      createdById: owner.id,
      productId: product.id,
      name: "Cycle 21",
      slug: `cycle-21-${product.id.slice(-6)}`,
      startDate: new Date("2030-03-02"),
      endDate: new Date("2030-03-16"),
    });
    await db.productOwner.create({ data: { productId: product.id, userId: owner.id } });
    const caller = createTestCaller(owner.id);
    const publicKey = { workspaceSlug: ws.slug, productSlug: product.slug, cycleSlug: cycle.slug };
    return { owner, ws, product, cycle, caller, publicKey };
  }

  it("publishes a one-outcome brief only once the Product owner signs it off", async () => {
    const { cycle, caller, publicKey } = await setup();
    const anon = createUnauthenticatedCaller();

    const brief = await caller.product.cycleBrief.create({ cycleId: cycle.id });
    await caller.product.cycleBrief.upsertOutcome({
      briefId: brief.id,
      text: "The Sudan team uses the app every week",
      why: "Their usage decides whether the team stays in the country",
    });

    expect(await anon.product.cycleBrief.publicGet(publicKey)).toBeNull();

    await caller.product.cycleBrief.signOff({ briefId: brief.id });

    const result = await anon.product.cycleBrief.publicGet(publicKey);
    expect(result?.brief.cycleName).toBe("Cycle 21");
    expect(result?.brief.outcomes).toEqual([
      expect.objectContaining({
        text: "The Sudan team uses the app every week",
        why: "Their usage decides whether the team stays in the country",
      }),
    ]);
  });

  it("creates at most one brief per cycle", async () => {
    const { cycle, caller } = await setup();
    const a = await caller.product.cycleBrief.create({ cycleId: cycle.id });
    const b = await caller.product.cycleBrief.create({ cycleId: cycle.id });
    expect(b.id).toBe(a.id);
    expect(await db.cycleBrief.count({ where: { cycleId: cycle.id } })).toBe(1);
  });

  it("refuses a brief on a legacy workspace-shared cycle", async () => {
    const { owner, ws, caller } = await setup();
    const legacy = await createCycle(db, { workspaceId: ws.id, createdById: owner.id });
    await expect(caller.product.cycleBrief.create({ cycleId: legacy.id })).rejects.toThrow(/product/i);
  });

  it("requires a plain-language why on every outcome", async () => {
    const { cycle, caller } = await setup();
    const brief = await caller.product.cycleBrief.create({ cycleId: cycle.id });
    await expect(
      caller.product.cycleBrief.upsertOutcome({ briefId: brief.id, text: "Ship it", why: "   " }),
    ).rejects.toThrow(/why is required/i);
  });
});

describe("cycleBrief Product owners", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  async function setup() {
    const admin = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: admin.id });
    const product = await createProduct(db, { workspaceId: ws.id, createdById: admin.id });
    const cycle = await createCycle(db, { workspaceId: ws.id, createdById: admin.id, productId: product.id });
    return { admin, ws, product, cycle, caller: createTestCaller(admin.id) };
  }

  it("lets a workspace admin name Product owners and rejects an agent", async () => {
    const { admin, ws, product, caller } = await setup();
    const person = await createUser(db);
    await addWorkspaceMember(db, ws.id, person.id, "member");
    const agent = await db.user.create({ data: { name: "Zoe", isAgent: true } });
    await addWorkspaceMember(db, ws.id, agent.id, "member");

    await caller.product.cycleBrief.setProductOwners({ productId: product.id, userIds: [admin.id, person.id] });
    const owners = await caller.product.cycleBrief.listProductOwners({ productId: product.id });
    expect(owners.map((o) => o.id).sort()).toEqual([admin.id, person.id].sort());

    await expect(
      caller.product.cycleBrief.setProductOwners({ productId: product.id, userIds: [admin.id, agent.id] }),
    ).rejects.toThrow(/person/i);
    // The rejected call changed nothing
    expect(await db.productOwner.count({ where: { productId: product.id } })).toBe(2);

    const candidates = await caller.product.cycleBrief.listOwnerCandidates({ productId: product.id });
    expect(candidates.map((c) => c.id)).not.toContain(agent.id);
  });

  it("does not let a plain member set Product owners", async () => {
    const { ws, product } = await setup();
    const member = await createUser(db);
    await addWorkspaceMember(db, ws.id, member.id, "member");
    await expect(
      createTestCaller(member.id).product.cycleBrief.setProductOwners({ productId: product.id, userIds: [member.id] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns FORBIDDEN when a non-owner or an agent owner signs off", async () => {
    const { ws, product, cycle, caller } = await setup();
    const brief = await caller.product.cycleBrief.create({ cycleId: cycle.id });
    await caller.product.cycleBrief.upsertOutcome({ briefId: brief.id, text: "Aim", why: "Because" });

    // No Product owner at all: nobody can sign off (open decision 2)
    await expect(caller.product.cycleBrief.signOff({ briefId: brief.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    // An agent left in the owner list (written directly) still cannot
    const agent = await db.user.create({ data: { name: "Zoe", isAgent: true } });
    await addWorkspaceMember(db, ws.id, agent.id, "member");
    await db.productOwner.create({ data: { productId: product.id, userId: agent.id } });
    await expect(
      createTestCaller(agent.id).product.cycleBrief.signOff({ briefId: brief.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await db.cycleBrief.findUniqueOrThrow({ where: { id: brief.id } })).planSignedOffAt).toBeNull();
  });
});
