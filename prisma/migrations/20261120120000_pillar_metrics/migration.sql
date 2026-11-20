-- Pillar metrics V1 (ADR-0087): a Pillar has one DRI, and standing Metrics with
-- their recorded values and history. A Key result may name the Metric it moves.
-- Additive only.

-- AlterTable
ALTER TABLE "Tag" ADD COLUMN     "driUserId" TEXT;

-- AlterTable
ALTER TABLE "KeyResult" ADD COLUMN     "metricId" TEXT;

-- CreateTable
CREATE TABLE "Metric" (
    "id" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "unitLabel" TEXT,
    "direction" TEXT NOT NULL,
    "healthyValue" DOUBLE PRECISION NOT NULL,
    "breachedValue" DOUBLE PRECISION NOT NULL,
    "warningValue" DOUBLE PRECISION,
    "cadence" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "lastState" TEXT,
    "lastStateAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Metric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricValue" (
    "id" TEXT NOT NULL,
    "metricId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricChange" (
    "id" TEXT NOT NULL,
    "metricId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Metric_tagId_idx" ON "Metric"("tagId");

-- CreateIndex
CREATE INDEX "Metric_workspaceId_idx" ON "Metric"("workspaceId");

-- CreateIndex
CREATE INDEX "MetricValue_metricId_recordedAt_idx" ON "MetricValue"("metricId", "recordedAt");

-- CreateIndex
CREATE INDEX "MetricChange_metricId_createdAt_idx" ON "MetricChange"("metricId", "createdAt");

-- CreateIndex
CREATE INDEX "Tag_driUserId_idx" ON "Tag"("driUserId");

-- CreateIndex
CREATE INDEX "KeyResult_metricId_idx" ON "KeyResult"("metricId");

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_driUserId_fkey" FOREIGN KEY ("driUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyResult" ADD CONSTRAINT "KeyResult_metricId_fkey" FOREIGN KEY ("metricId") REFERENCES "Metric"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Metric" ADD CONSTRAINT "Metric_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Metric" ADD CONSTRAINT "Metric_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Metric" ADD CONSTRAINT "Metric_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricValue" ADD CONSTRAINT "MetricValue_metricId_fkey" FOREIGN KEY ("metricId") REFERENCES "Metric"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricValue" ADD CONSTRAINT "MetricValue_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricChange" ADD CONSTRAINT "MetricChange_metricId_fkey" FOREIGN KEY ("metricId") REFERENCES "Metric"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricChange" ADD CONSTRAINT "MetricChange_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

