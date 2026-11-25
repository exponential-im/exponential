-- Pillars and labels on Decisions (ADR-0086): the Decision Log filters by
-- them, and a Pillar page lists its decisions. Additive only.

-- CreateTable
CREATE TABLE "DecisionTag" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DecisionTag_tagId_idx" ON "DecisionTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionTag_decisionId_tagId_key" ON "DecisionTag"("decisionId", "tagId");

-- AddForeignKey
ALTER TABLE "DecisionTag" ADD CONSTRAINT "DecisionTag_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionTag" ADD CONSTRAINT "DecisionTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
