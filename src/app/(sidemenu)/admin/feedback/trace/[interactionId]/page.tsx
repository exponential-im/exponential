import { InteractionTrace } from "./InteractionTrace";

// Admin only: the /admin layout redirects everyone else, and the query behind
// this view (`feedback.getInteractionTrace`) refuses them on its own.
export default async function InteractionTracePage({
  params,
}: {
  params: Promise<{ interactionId: string }>;
}) {
  const { interactionId } = await params;
  return <InteractionTrace interactionId={interactionId} />;
}
