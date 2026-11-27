"use client";

import { useMemo, useState } from "react";
import { Button, Group, Modal, Select, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { CollapsibleSection } from "~/app/_components/product/CollapsibleSection";
import { DecisionGroup } from "~/app/_components/product/FeatureDecisionsSection";
import type { RouterOutputs } from "~/trpc/react";
import { decisionRowText } from "~/lib/decision-groups";

type TicketDecision = RouterOutputs["product"]["ticket"]["getById"]["decisions"][number];

/**
 * The Decisions block for a ticket - decisions linked "implemented by" it
 * (ADR-0060), the ticket-page twin of FeatureDecisionsSection. An OPEN
 * decision linked to a ticket reads as a question raised on it; everything
 * else as a decision the ticket carries out.
 *
 * Renders nothing until something is linked, so tickets without decisions
 * keep the page they had. The link picker is still reachable then: the page
 * opens it from the ticket's menu through `linkOpen`.
 */
export function TicketDecisionsSection({
  ticketId,
  decisions,
  workspaceId,
  workspaceSlug,
  linkOpen,
  onLinkOpenChange,
}: {
  ticketId: string;
  /** `ticket.decisions` from getById - already filtered by the Decision Log's resolver. */
  decisions: TicketDecision[];
  workspaceId: string | null | undefined;
  workspaceSlug: string | undefined;
  linkOpen: boolean;
  onLinkOpenChange: (open: boolean) => void;
}) {
  const utils = api.useUtils();
  // Linking can also adopt the decision's actions into the ticket, so the
  // whole ticket refetches, not just this block.
  const refresh = async () => {
    await utils.product.ticket.getById.invalidate({ id: ticketId });
  };

  const unlink = api.decision.unlink.useMutation({
    onSuccess: refresh,
    onError: (error) =>
      notifications.show({ color: "red", title: "Could not remove the link", message: error.message }),
  });

  const linked = decisions;
  const openQuestions = linked.filter((d) => d.status === "OPEN");
  const decided = linked.filter((d) => d.status !== "OPEN");

  const picker = (
    <LinkDecisionModal
      opened={linkOpen}
      onClose={() => onLinkOpenChange(false)}
      ticketId={ticketId}
      workspaceId={workspaceId}
      linkedIds={linked.map((d) => d.id)}
      onLinked={refresh}
    />
  );

  if (linked.length === 0) return picker;

  const remove = (decision: TicketDecision) => {
    if (!workspaceId || !decision.linkId) return;
    unlink.mutate({ workspaceId, linkId: decision.linkId });
  };

  return (
    <>
      <CollapsibleSection
        title="Decisions"
        meta={
          openQuestions.length > 0
            ? `${decided.length} decided · ${openQuestions.length} open`
            : String(decided.length)
        }
        action={
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            leftSection={<IconPlus size={12} />}
            onClick={() => onLinkOpenChange(true)}
          >
            Link
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {openQuestions.length > 0 && (
            <DecisionGroup
              title="Open questions"
              decisions={openQuestions}
              workspaceSlug={workspaceSlug}
              onRemove={remove}
            />
          )}
          {decided.length > 0 && (
            <DecisionGroup
              title="Decisions"
              decisions={decided}
              workspaceSlug={workspaceSlug}
              onRemove={remove}
            />
          )}
        </div>
      </CollapsibleSection>
      {picker}
    </>
  );
}

/**
 * Pick an existing decision from the Decision Log and link it to the ticket.
 * Candidates come from `decision.list`, so the picker offers exactly what the
 * Log shows the caller - no drafts.
 */
function LinkDecisionModal({
  opened,
  onClose,
  ticketId,
  workspaceId,
  linkedIds,
  onLinked,
}: {
  opened: boolean;
  onClose: () => void;
  ticketId: string;
  workspaceId: string | null | undefined;
  linkedIds: string[];
  onLinked: () => Promise<void>;
}) {
  const [decisionId, setDecisionId] = useState<string | null>(null);
  const { data: candidates, isLoading } = api.decision.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: opened && !!workspaceId },
  );

  const options = useMemo(() => {
    const taken = new Set(linkedIds);
    return (candidates ?? [])
      .filter((d) => !taken.has(d.id))
      .map((d) => ({ value: d.id, label: `${d.label} — ${decisionRowText(d)}` }));
  }, [candidates, linkedIds]);

  const close = () => {
    setDecisionId(null);
    onClose();
  };

  const link = api.decision.linkTicket.useMutation({
    onSuccess: async () => {
      await onLinked();
      close();
    },
    onError: (error) =>
      notifications.show({ color: "red", title: "Could not link the decision", message: error.message }),
  });

  return (
    <Modal opened={opened} onClose={close} title="Link a decision" size="lg">
      <Text size="sm" className="text-text-secondary mb-3">
        The decision shows on this ticket, and the ticket shows on the decision as
        &ldquo;Implemented by&rdquo;.
      </Text>
      <Select
        data={options}
        value={decisionId}
        onChange={setDecisionId}
        searchable
        placeholder={isLoading ? "Loading decisions…" : "Search by D-number or statement"}
        nothingFoundMessage="No decision matches"
        comboboxProps={{ withinPortal: true }}
        data-autofocus
      />
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={close}>
          Cancel
        </Button>
        <Button
          disabled={!decisionId || !workspaceId}
          loading={link.isPending}
          onClick={() => {
            if (!decisionId || !workspaceId) return;
            link.mutate({ workspaceId, decisionId, ticketId });
          }}
        >
          Link decision
        </Button>
      </Group>
    </Modal>
  );
}
