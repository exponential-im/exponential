-- CreateTable
CREATE TABLE "ProductOwner" (
    "productId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductOwner_pkey" PRIMARY KEY ("productId","userId")
);

-- CreateTable
CREATE TABLE "CycleBrief" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "planSignedOffAt" TIMESTAMP(3),
    "planSignedOffById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CycleBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleOutcome" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "draftText" TEXT NOT NULL,
    "draftWhy" TEXT NOT NULL,
    "goalId" INTEGER,
    "publicText" TEXT,
    "publicWhy" TEXT,
    "changedAt" TIMESTAMP(3),
    "removeRequested" BOOLEAN NOT NULL DEFAULT false,
    "removedAt" TIMESTAMP(3),
    "status" TEXT,
    "statusSetAt" TIMESTAMP(3),
    "statusSetById" TEXT,
    "result" TEXT,
    "resultNote" TEXT,
    "carriedFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CycleOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleOutcomeFeature" (
    "outcomeId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,

    CONSTRAINT "CycleOutcomeFeature_pkey" PRIMARY KEY ("outcomeId","featureId")
);

-- CreateTable
CREATE TABLE "CycleBriefExclusion" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "draftText" TEXT NOT NULL,
    "draftReason" TEXT NOT NULL,
    "insightId" TEXT,
    "publicText" TEXT,
    "publicReason" TEXT,
    "removeRequested" BOOLEAN NOT NULL DEFAULT false,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CycleBriefExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductOwner_userId_idx" ON "ProductOwner"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CycleBrief_cycleId_key" ON "CycleBrief"("cycleId");

-- CreateIndex
CREATE INDEX "CycleBrief_productId_idx" ON "CycleBrief"("productId");

-- CreateIndex
CREATE INDEX "CycleBrief_workspaceId_idx" ON "CycleBrief"("workspaceId");

-- CreateIndex
CREATE INDEX "CycleOutcome_briefId_idx" ON "CycleOutcome"("briefId");

-- CreateIndex
CREATE INDEX "CycleOutcome_goalId_idx" ON "CycleOutcome"("goalId");

-- CreateIndex
CREATE INDEX "CycleOutcome_carriedFromId_idx" ON "CycleOutcome"("carriedFromId");

-- CreateIndex
CREATE INDEX "CycleOutcomeFeature_featureId_idx" ON "CycleOutcomeFeature"("featureId");

-- CreateIndex
CREATE INDEX "CycleBriefExclusion_briefId_idx" ON "CycleBriefExclusion"("briefId");

-- CreateIndex
CREATE INDEX "CycleBriefExclusion_insightId_idx" ON "CycleBriefExclusion"("insightId");

-- AddForeignKey
ALTER TABLE "ProductOwner" ADD CONSTRAINT "ProductOwner_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOwner" ADD CONSTRAINT "ProductOwner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleBrief" ADD CONSTRAINT "CycleBrief_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "List"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleBrief" ADD CONSTRAINT "CycleBrief_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleBrief" ADD CONSTRAINT "CycleBrief_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleOutcome" ADD CONSTRAINT "CycleOutcome_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "CycleBrief"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleOutcome" ADD CONSTRAINT "CycleOutcome_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleOutcome" ADD CONSTRAINT "CycleOutcome_carriedFromId_fkey" FOREIGN KEY ("carriedFromId") REFERENCES "CycleOutcome"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleOutcomeFeature" ADD CONSTRAINT "CycleOutcomeFeature_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "CycleOutcome"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleOutcomeFeature" ADD CONSTRAINT "CycleOutcomeFeature_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleBriefExclusion" ADD CONSTRAINT "CycleBriefExclusion_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "CycleBrief"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleBriefExclusion" ADD CONSTRAINT "CycleBriefExclusion_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "Insight"("id") ON DELETE SET NULL ON UPDATE CASCADE;

