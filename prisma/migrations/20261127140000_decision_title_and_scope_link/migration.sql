-- AlterTable
ALTER TABLE "Decision" ADD COLUMN "title" TEXT;

-- AlterTable
ALTER TABLE "DecisionLink" ADD COLUMN "scopeId" TEXT;

-- CreateIndex
CREATE INDEX "DecisionLink_scopeId_idx" ON "DecisionLink"("scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionLink_decisionId_scopeId_key" ON "DecisionLink"("decisionId", "scopeId");

-- AddForeignKey
ALTER TABLE "DecisionLink" ADD CONSTRAINT "DecisionLink_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "FeatureScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
