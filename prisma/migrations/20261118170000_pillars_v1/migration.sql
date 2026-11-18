-- Pillars V1 (ADR-0085): a Pillar is a Tag with category = "pillar".
-- Adds the inactive flag and lets Projects, Goals and Resources carry tags.
-- Additive only: no existing row changes.


-- AlterTable
ALTER TABLE "Tag" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProjectTag" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalTag" (
    "id" TEXT NOT NULL,
    "goalId" INTEGER NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceTag" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectTag_tagId_idx" ON "ProjectTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectTag_projectId_tagId_key" ON "ProjectTag"("projectId", "tagId");

-- CreateIndex
CREATE INDEX "GoalTag_tagId_idx" ON "GoalTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "GoalTag_goalId_tagId_key" ON "GoalTag"("goalId", "tagId");

-- CreateIndex
CREATE INDEX "ResourceTag_tagId_idx" ON "ResourceTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceTag_resourceId_tagId_key" ON "ResourceTag"("resourceId", "tagId");

-- AddForeignKey
ALTER TABLE "ProjectTag" ADD CONSTRAINT "ProjectTag_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTag" ADD CONSTRAINT "ProjectTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalTag" ADD CONSTRAINT "GoalTag_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalTag" ADD CONSTRAINT "GoalTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceTag" ADD CONSTRAINT "ResourceTag_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceTag" ADD CONSTRAINT "ResourceTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

