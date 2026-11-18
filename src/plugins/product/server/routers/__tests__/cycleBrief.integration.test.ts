import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "~/test/test-db";
import { createTestCaller, createUnauthenticatedCaller } from "~/test/trpc-helpers";
import {
  createUser,
  createWorkspace,
  createProduct,
  createCycle,
  addWorkspaceMember,
  createFeature,
  createGoal,
} from "~/test/factories";

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

describe("cycleBrief weekly status", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("goes public at once without sign-off, with its date and without who set it", async () => {
    const owner = await createUser(db, { name: "Olive Owner" });
    const ws = await createWorkspace(db, { ownerId: owner.id });
    const product = await createProduct(db, { workspaceId: ws.id, createdById: owner.id });
    const cycle = await createCycle(db, { workspaceId: ws.id, createdById: owner.id, productId: product.id });
    await db.productOwner.create({ data: { productId: product.id, userId: owner.id } });
    const member = await createUser(db, { name: "Mona Member" });
    await addWorkspaceMember(db, ws.id, member.id, "member");

    const caller = createTestCaller(owner.id);
    const brief = await caller.product.cycleBrief.create({ cycleId: cycle.id });
    const outcome = await caller.product.cycleBrief.upsertOutcome({ briefId: brief.id, text: "Aim", why: "Because" });
    await caller.product.cycleBrief.signOff({ briefId: brief.id });

    await createTestCaller(member.id).product.cycleBrief.setStatus({ outcomeId: outcome.id, status: "at_risk" });

    const result = await createUnauthenticatedCaller().product.cycleBrief.publicGet({
      workspaceSlug: ws.slug,
      productSlug: product.slug,
      cycleSlug: cycle.slug,
    });
    expect(result?.brief.outcomes[0]?.status).toBe("at_risk");
    expect(result?.brief.outcomes[0]?.statusSetAt).toBeInstanceOf(Date);
    const json = JSON.stringify(result);
    expect(json).not.toContain(member.id);
    expect(json).not.toContain("Mona Member");
    expect(json).not.toContain("Olive Owner");
  });

  it("is refused for a viewer", async () => {
    const owner = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: owner.id });
    const product = await createProduct(db, { workspaceId: ws.id, createdById: owner.id });
    const cycle = await createCycle(db, { workspaceId: ws.id, createdById: owner.id, productId: product.id });
    const viewer = await createUser(db);
    await addWorkspaceMember(db, ws.id, viewer.id, "viewer");
    const brief = await createTestCaller(owner.id).product.cycleBrief.create({ cycleId: cycle.id });
    const outcome = await createTestCaller(owner.id).product.cycleBrief.upsertOutcome({
      briefId: brief.id,
      text: "Aim",
      why: "Because",
    });
    await expect(
      createTestCaller(viewer.id).product.cycleBrief.setStatus({ outcomeId: outcome.id, status: "done" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("cycleBrief changes after sign-off", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  async function signedOffBrief() {
    const owner = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: owner.id });
    const product = await createProduct(db, { workspaceId: ws.id, createdById: owner.id });
    const cycle = await createCycle(db, { workspaceId: ws.id, createdById: owner.id, productId: product.id });
    await db.productOwner.create({ data: { productId: product.id, userId: owner.id } });
    const caller = createTestCaller(owner.id);
    const brief = await caller.product.cycleBrief.create({ cycleId: cycle.id });
    const a = await caller.product.cycleBrief.upsertOutcome({ briefId: brief.id, text: "Old aim", why: "Old why" });
    const b = await caller.product.cycleBrief.upsertOutcome({ briefId: brief.id, text: "Second aim", why: "Why two" });
    await caller.product.cycleBrief.signOff({ briefId: brief.id });
    const readPublic = () =>
      createUnauthenticatedCaller().product.cycleBrief.publicGet({
        workspaceSlug: ws.slug,
        productSlug: product.slug,
        cycleSlug: cycle.slug,
      });
    return { caller, brief, cycle, a, b, readPublic };
  }

  it("keeps the signed-off wording public until the next sign-off, which stamps the change date", async () => {
    const { caller, brief, a, readPublic } = await signedOffBrief();
    const first = await readPublic();
    expect(first?.brief.outcomes.every((o) => o.changedAt === null)).toBe(true);

    await caller.product.cycleBrief.upsertOutcome({ briefId: brief.id, outcomeId: a.id, text: "New aim", why: "Old why" });
    const pending = await readPublic();
    expect(pending?.brief.outcomes.map((o) => o.text)).toEqual(["Old aim", "Second aim"]);

    await caller.product.cycleBrief.signOff({ briefId: brief.id });
    const after = await readPublic();
    expect(after?.brief.outcomes[0]).toMatchObject({ text: "New aim", changedAt: expect.any(Date) });
    expect(after?.brief.outcomes[1]?.changedAt).toBeNull();
  });

  it("shows an added outcome only after sign-off, with its date", async () => {
    const { caller, brief, readPublic } = await signedOffBrief();
    await caller.product.cycleBrief.upsertOutcome({ briefId: brief.id, text: "Third aim", why: "Why three" });
    expect((await readPublic())?.brief.outcomes).toHaveLength(2);
    await caller.product.cycleBrief.signOff({ briefId: brief.id });
    const after = await readPublic();
    expect(after?.brief.outcomes).toHaveLength(3);
    expect(after?.brief.outcomes[2]).toMatchObject({ text: "Third aim", changedAt: expect.any(Date) });
  });

  it("keeps a removed outcome public until the removal is signed off", async () => {
    const { caller, brief, cycle, b, readPublic } = await signedOffBrief();
    await caller.product.cycleBrief.requestRemoveOutcome({ outcomeId: b.id });
    expect((await readPublic())?.brief.outcomes.map((o) => o.text)).toEqual(["Old aim", "Second aim"]);

    const internal = await caller.product.cycleBrief.getForCycle({ cycleId: cycle.id });
    expect(internal.brief?.outcomes.find((o) => o.id === b.id)?.pendingChange).toBe("removed");
    expect(internal.hasPendingChanges).toBe(true);

    await caller.product.cycleBrief.signOff({ briefId: brief.id });
    expect((await readPublic())?.brief.outcomes.map((o) => o.text)).toEqual(["Old aim"]);
  });

  it("deletes a never-public outcome at once", async () => {
    const { caller, brief } = await signedOffBrief();
    const draft = await caller.product.cycleBrief.upsertOutcome({ briefId: brief.id, text: "Idea", why: "Maybe" });
    expect(await caller.product.cycleBrief.requestRemoveOutcome({ outcomeId: draft.id })).toEqual({ deleted: true });
    expect(await db.cycleOutcome.findUnique({ where: { id: draft.id } })).toBeNull();
  });
});

describe("cycleBrief outcome links", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("links Features of the same product and one Objective, never shown publicly", async () => {
    const owner = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: owner.id });
    const product = await createProduct(db, { workspaceId: ws.id, createdById: owner.id });
    const other = await createProduct(db, { workspaceId: ws.id, createdById: owner.id });
    const cycle = await createCycle(db, { workspaceId: ws.id, createdById: owner.id, productId: product.id });
    await db.productOwner.create({ data: { productId: product.id, userId: owner.id } });
    const feature = await createFeature(db, { productId: product.id, createdById: owner.id, name: "Map exports" });
    const foreign = await createFeature(db, { productId: other.id, createdById: owner.id });
    const goal = await createGoal(db, { userId: owner.id, workspaceId: ws.id, title: "Grow active countries" });

    const caller = createTestCaller(owner.id);
    const brief = await caller.product.cycleBrief.create({ cycleId: cycle.id });
    const outcome = await caller.product.cycleBrief.upsertOutcome({
      briefId: brief.id,
      text: "Aim",
      why: "Because",
      featureIds: [feature.id],
      goalId: goal.id,
    });

    await expect(
      caller.product.cycleBrief.upsertOutcome({
        briefId: brief.id,
        outcomeId: outcome.id,
        text: "Aim",
        why: "Because",
        featureIds: [foreign.id],
      }),
    ).rejects.toThrow(/same product/i);

    const internal = await caller.product.cycleBrief.getForCycle({ cycleId: cycle.id });
    expect(internal.brief?.outcomes[0]?.features.map((f) => f.feature.name)).toEqual(["Map exports"]);
    expect(internal.brief?.outcomes[0]?.goal?.title).toBe("Grow active countries");

    await caller.product.cycleBrief.signOff({ briefId: brief.id });
    const json = JSON.stringify(
      await createUnauthenticatedCaller().product.cycleBrief.publicGet({
        workspaceSlug: ws.slug,
        productSlug: product.slug,
        cycleSlug: cycle.slug,
      }),
    );
    for (const secret of [feature.id, "Map exports", "goal", "Grow active countries"]) {
      expect(json).not.toContain(secret);
    }
  });
});

describe("cycleBrief Not this cycle", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("requires a reason, links an Insight of the product, and goes public with the plan", async () => {
    const owner = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: owner.id });
    const product = await createProduct(db, { workspaceId: ws.id, createdById: owner.id });
    const cycle = await createCycle(db, { workspaceId: ws.id, createdById: owner.id, productId: product.id });
    await db.productOwner.create({ data: { productId: product.id, userId: owner.id } });
    const insight = await db.insight.create({
      data: { productId: product.id, createdById: owner.id, type: "FEEDBACK", title: "Arabic please", source: "Noah, Sudan" },
    });
    const caller = createTestCaller(owner.id);
    const brief = await caller.product.cycleBrief.create({ cycleId: cycle.id });
    await caller.product.cycleBrief.upsertOutcome({ briefId: brief.id, text: "Aim", why: "Because" });

    await expect(
      caller.product.cycleBrief.upsertExclusion({ briefId: brief.id, text: "Arabic UI", reason: "" }),
    ).rejects.toThrow(/reason is required/i);

    await caller.product.cycleBrief.upsertExclusion({
      briefId: brief.id,
      text: "Arabic UI",
      reason: "Too few users read Arabic yet",
      insightId: insight.id,
    });
    const readPublic = () =>
      createUnauthenticatedCaller().product.cycleBrief.publicGet({
        workspaceSlug: ws.slug,
        productSlug: product.slug,
        cycleSlug: cycle.slug,
      });

    await caller.product.cycleBrief.signOff({ briefId: brief.id });
    const result = await readPublic();
    expect(result?.brief.exclusions).toEqual([{ text: "Arabic UI", reason: "Too few users read Arabic yet" }]);
    const json = JSON.stringify(result);
    expect(json).not.toContain(insight.id);
    expect(json).not.toContain("Noah");
  });
});

describe("cycleBrief public index", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("lists only signed-off briefs, newest cycle first, and is null with none", async () => {
    const owner = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: owner.id });
    const product = await createProduct(db, { workspaceId: ws.id, createdById: owner.id });
    await db.productOwner.create({ data: { productId: product.id, userId: owner.id } });
    const caller = createTestCaller(owner.id);
    const anon = createUnauthenticatedCaller();
    const key = { workspaceSlug: ws.slug, productSlug: product.slug };

    async function briefFor(name: string, start: string, signOff: boolean) {
      const cycle = await createCycle(db, {
        workspaceId: ws.id,
        createdById: owner.id,
        productId: product.id,
        name,
        startDate: new Date(start),
      });
      const brief = await caller.product.cycleBrief.create({ cycleId: cycle.id });
      await caller.product.cycleBrief.upsertOutcome({ briefId: brief.id, text: `${name} aim`, why: "Because" });
      if (signOff) await caller.product.cycleBrief.signOff({ briefId: brief.id });
    }

    await briefFor("Cycle 20", "2030-02-02", false);
    expect(await anon.product.cycleBrief.publicList(key)).toBeNull();

    await briefFor("Cycle 19", "2030-01-19", true);
    await briefFor("Cycle 21", "2030-02-16", true);
    const result = await anon.product.cycleBrief.publicList(key);
    expect(result?.briefs.map((b) => b.cycleName)).toEqual(["Cycle 21", "Cycle 19"]);
  });
});

describe("cycleBrief close and results", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("closes the brief when the cycle completes and takes results only then", async () => {
    const owner = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: owner.id });
    const product = await createProduct(db, { workspaceId: ws.id, createdById: owner.id });
    const cycle = await createCycle(db, { workspaceId: ws.id, createdById: owner.id, productId: product.id });
    await db.productOwner.create({ data: { productId: product.id, userId: owner.id } });
    const caller = createTestCaller(owner.id);
    const brief = await caller.product.cycleBrief.create({ cycleId: cycle.id });
    const outcome = await caller.product.cycleBrief.upsertOutcome({ briefId: brief.id, text: "Aim", why: "Because" });
    await caller.product.cycleBrief.signOff({ briefId: brief.id });

    await expect(
      caller.product.cycleBrief.setResult({ outcomeId: outcome.id, result: "partly" }),
    ).rejects.toThrow(/completed/i);

    await caller.product.cycle.update({ id: cycle.id, status: "COMPLETED" });
    const closed = await db.cycleBrief.findUniqueOrThrow({ where: { id: brief.id } });
    expect(closed.closedAt).toBeInstanceOf(Date);
    // Nothing writes a result automatically
    expect((await db.cycleOutcome.findUniqueOrThrow({ where: { id: outcome.id } })).result).toBeNull();

    await expect(
      caller.product.cycleBrief.setStatus({ outcomeId: outcome.id, status: "done" }),
    ).rejects.toThrow(/closed/i);

    await caller.product.cycleBrief.setResult({ outcomeId: outcome.id, result: "partly", note: "Two of three regions" });
    const result = await createUnauthenticatedCaller().product.cycleBrief.publicGet({
      workspaceSlug: ws.slug,
      productSlug: product.slug,
      cycleSlug: cycle.slug,
    });
    expect(result?.brief.closed).toBe(true);
    expect(result?.brief.outcomes[0]).toMatchObject({ result: "partly", resultNote: "Two of three regions" });
  });

  it("closes the brief when the cycle completes on its own end date", async () => {
    const owner = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: owner.id });
    const product = await createProduct(db, { workspaceId: ws.id, createdById: owner.id });
    const cycle = await createCycle(db, {
      workspaceId: ws.id,
      createdById: owner.id,
      productId: product.id,
      startDate: new Date("2020-01-06"),
      endDate: new Date("2020-01-20"),
    });
    const caller = createTestCaller(owner.id);
    const brief = await caller.product.cycleBrief.create({ cycleId: cycle.id });
    await caller.product.cycle.list({ workspaceId: ws.id, productId: product.id, autoCreate: false });
    expect((await db.cycleBrief.findUniqueOrThrow({ where: { id: brief.id } })).closedAt).toBeInstanceOf(Date);
  });
});

describe("cycleBrief carry-over", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("copies nothing on its own, and lets only a Product owner carry an outcome over", async () => {
    const owner = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: owner.id });
    const product = await createProduct(db, { workspaceId: ws.id, createdById: owner.id });
    await db.productOwner.create({ data: { productId: product.id, userId: owner.id } });
    const member = await createUser(db);
    await addWorkspaceMember(db, ws.id, member.id, "member");
    const caller = createTestCaller(owner.id);

    const c20 = await createCycle(db, {
      workspaceId: ws.id,
      createdById: owner.id,
      productId: product.id,
      name: "Cycle 20",
      startDate: new Date("2030-02-02"),
    });
    const c21 = await createCycle(db, {
      workspaceId: ws.id,
      createdById: owner.id,
      productId: product.id,
      name: "Cycle 21",
      slug: `cycle-21-${product.id.slice(-6)}`,
      startDate: new Date("2030-02-16"),
    });
    const b20 = await caller.product.cycleBrief.create({ cycleId: c20.id });
    const unfinished = await caller.product.cycleBrief.upsertOutcome({
      briefId: b20.id,
      text: "Sudan uses it weekly",
      why: "Decides the next country",
    });
    await caller.product.cycleBrief.signOff({ briefId: b20.id });
    await caller.product.cycle.update({ id: c20.id, status: "COMPLETED" });
    await caller.product.cycleBrief.setResult({ outcomeId: unfinished.id, result: "missed" });

    const b21 = await caller.product.cycleBrief.create({ cycleId: c21.id });
    // Nothing rolled over
    expect(await db.cycleOutcome.count({ where: { briefId: b21.id } })).toBe(0);

    const candidates = await caller.product.cycleBrief.carryOverCandidates({ briefId: b21.id });
    expect(candidates?.cycleName).toBe("Cycle 20");
    expect(candidates?.outcomes.map((o) => o.id)).toEqual([unfinished.id]);

    await expect(
      createTestCaller(member.id).product.cycleBrief.carryOver({ outcomeId: unfinished.id, toBriefId: b21.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await caller.product.cycleBrief.carryOver({ outcomeId: unfinished.id, toBriefId: b21.id });
    await expect(
      caller.product.cycleBrief.carryOver({ outcomeId: unfinished.id, toBriefId: b21.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await caller.product.cycleBrief.signOff({ briefId: b21.id });
    const result = await createUnauthenticatedCaller().product.cycleBrief.publicGet({
      workspaceSlug: ws.slug,
      productSlug: product.slug,
      cycleSlug: c21.slug,
    });
    expect(result?.brief.outcomes[0]).toMatchObject({
      text: "Sudan uses it weekly",
      carriedFromCycle: "Cycle 20",
      result: null,
      status: null,
    });
  });
});

describe("cycleBrief review fixes", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("starts a brief on an already-completed cycle closed", async () => {
    const owner = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: owner.id });
    const product = await createProduct(db, { workspaceId: ws.id, createdById: owner.id });
    const cycle = await createCycle(db, { workspaceId: ws.id, createdById: owner.id, productId: product.id });
    await db.list.update({ where: { id: cycle.id }, data: { status: "COMPLETED" } });
    const caller = createTestCaller(owner.id);
    const brief = await caller.product.cycleBrief.create({ cycleId: cycle.id });
    expect((await db.cycleBrief.findUniqueOrThrow({ where: { id: brief.id } })).closedAt).toBeInstanceOf(Date);
    const outcome = await caller.product.cycleBrief.upsertOutcome({ briefId: brief.id, text: "Aim", why: "Because" });
    await expect(caller.product.cycleBrief.setStatus({ outcomeId: outcome.id, status: "done" })).rejects.toThrow(
      /closed/i,
    );
  });

  it("offers an outcome for carry-over again once its carried copy was removed", async () => {
    const owner = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: owner.id });
    const product = await createProduct(db, { workspaceId: ws.id, createdById: owner.id });
    await db.productOwner.create({ data: { productId: product.id, userId: owner.id } });
    const caller = createTestCaller(owner.id);
    const c1 = await createCycle(db, {
      workspaceId: ws.id,
      createdById: owner.id,
      productId: product.id,
      startDate: new Date("2030-04-01"),
    });
    const c2 = await createCycle(db, {
      workspaceId: ws.id,
      createdById: owner.id,
      productId: product.id,
      startDate: new Date("2030-04-15"),
    });
    const b1 = await caller.product.cycleBrief.create({ cycleId: c1.id });
    const source = await caller.product.cycleBrief.upsertOutcome({ briefId: b1.id, text: "Aim", why: "Because" });
    const b2 = await caller.product.cycleBrief.create({ cycleId: c2.id });
    const copy = await caller.product.cycleBrief.carryOver({ outcomeId: source.id, toBriefId: b2.id });
    await caller.product.cycleBrief.signOff({ briefId: b2.id });
    await caller.product.cycleBrief.requestRemoveOutcome({ outcomeId: copy.id });
    await caller.product.cycleBrief.upsertOutcome({ briefId: b2.id, text: "Other", why: "Still a plan" });
    await caller.product.cycleBrief.signOff({ briefId: b2.id });

    const candidates = await caller.product.cycleBrief.carryOverCandidates({ briefId: b2.id });
    expect(candidates?.outcomes.find((o) => o.id === source.id)?.isCarried).toBe(false);
  });
});
