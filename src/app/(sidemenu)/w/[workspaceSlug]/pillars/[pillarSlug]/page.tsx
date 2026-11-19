import { PillarPage } from "~/app/_components/pillars/PillarPage";

/**
 * A Pillar's page: one standing area of the workspace's work (ADR-0086).
 * `pillarSlug` is the tag's slug; an id there (links made before slugs) still
 * resolves, and the page replaces the URL with the slug form.
 */
export default async function PillarRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string; pillarSlug: string }>;
}) {
  const { workspaceSlug, pillarSlug } = await params;
  return <PillarPage pillarSlug={pillarSlug} workspaceSlug={workspaceSlug} />;
}
