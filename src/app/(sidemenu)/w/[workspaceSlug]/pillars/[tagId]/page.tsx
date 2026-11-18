import { PillarPage } from "~/app/_components/pillars/PillarPage";

/** A Pillar's page: one standing area of the workspace's work (ADR-0085). */
export default async function PillarRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string; tagId: string }>;
}) {
  const { workspaceSlug, tagId } = await params;
  return <PillarPage tagId={tagId} workspaceSlug={workspaceSlug} />;
}
