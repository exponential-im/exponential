-- Pillars V3 (ADR-0085): recurring tasks carry Pillars, and a Pillar lists the
-- Positions accountable for it (display only, never routing). Additive only.

-- CreateTable
CREATE TABLE "RecurringTaskTag" (
    "id" TEXT NOT NULL,
    "recurringTaskId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringTaskTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PillarPosition" (
    "tagId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PillarPosition_pkey" PRIMARY KEY ("tagId","positionId")
);

-- CreateIndex
CREATE INDEX "RecurringTaskTag_tagId_idx" ON "RecurringTaskTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringTaskTag_recurringTaskId_tagId_key" ON "RecurringTaskTag"("recurringTaskId", "tagId");

-- CreateIndex
CREATE INDEX "PillarPosition_positionId_idx" ON "PillarPosition"("positionId");

-- AddForeignKey
ALTER TABLE "RecurringTaskTag" ADD CONSTRAINT "RecurringTaskTag_recurringTaskId_fkey" FOREIGN KEY ("recurringTaskId") REFERENCES "RecurringTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTaskTag" ADD CONSTRAINT "RecurringTaskTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PillarPosition" ADD CONSTRAINT "PillarPosition_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PillarPosition" ADD CONSTRAINT "PillarPosition_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

