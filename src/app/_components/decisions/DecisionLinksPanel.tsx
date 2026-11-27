"use client";

import { useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Select,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconPlus, IconX } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";
import { scopeGroupName } from "~/lib/decision-groups";

/**
 * "Implemented by" for a Decision (ADR-0060): the tickets, features and
 * scopes that carry it out, through DecisionLink. The Pillar page groups
 * decisions by these links (ticket 1004). Same shape as the ADR page's
 * ImplementedByPicker, on the decision router instead of the adr one.
 */

interface DecisionLinkRow {
  id: string;
  ticket: {
    id: string;
    shortId: string | null;
    number: number;
    title: string;
    status: string;
  } | null;
  feature: { id: string; name: string; status: string } | null;
  scope: {
    id: string;
    version: string;
    description: string;
    status: string;
    feature: { id: string; name: string };
  } | null;
  /** The fourth arm of DecisionLink; rendered by DecisionActionsPanel. */
  action: { id: string } | null;
}

interface DecisionLinksPanelProps {
  workspaceId: string;
  decisionId: string;
  links: DecisionLinkRow[];
  canEdit: boolean;
}

export function DecisionLinksPanel({
  workspaceId,
  decisionId,
  links: allLinks,
  canEdit,
}: DecisionLinksPanelProps) {
  // Actions share the DecisionLink table but have their own block.
  const links = allLinks.filter((l) => l.action === null);
  const utils = api.useUtils();
  const [adding, setAdding] = useState(false);
  const [productId, setProductId] = useState<string | null>(null);

  const { data: products } = api.product.product.list.useQuery(
    { workspaceId },
    { enabled: adding },
  );
  const { data: tickets } = api.product.ticket.listSummaries.useQuery(
    { productId: productId ?? "" },
    { enabled: adding && !!productId },
  );
  const { data: features } = api.product.feature.list.useQuery(
    { productId: productId ?? "" },
    { enabled: adding && !!productId },
  );

  const invalidate = async () => {
    await utils.decision.get.invalidate({ workspaceId, decisionId });
    await utils.decision.list.invalidate();
  };
  const onError = (title: string) => (error: { message: string }) =>
    notifications.show({ title, message: error.message, color: "red" });

  const linkTicket = api.decision.linkTicket.useMutation({
    onSuccess: async (result) => {
      await invalidate();
      // Linking the ticket pulls the decision's own actions onto it.
      if (result.adoptedActions > 0) {
        notifications.show({
          message: `${result.adoptedActions} action${result.adoptedActions === 1 ? "" : "s"} from this decision added to the ticket`,
        });
      }
    },
    onError: onError("Couldn't link"),
  });
  const linkFeature = api.decision.linkFeature.useMutation({
    onSuccess: invalidate,
    onError: onError("Couldn't link"),
  });
  const linkScope = api.decision.linkScope.useMutation({
    onSuccess: invalidate,
    onError: onError("Couldn't link"),
  });
  const unlink = api.decision.unlink.useMutation({
    onSuccess: invalidate,
    onError: onError("Couldn't unlink"),
  });
  const linking = linkTicket.isPending || linkFeature.isPending || linkScope.isPending;

  const linkedTicketIds = new Set(links.map((l) => l.ticket?.id).filter(Boolean) as string[]);
  const linkedFeatureIds = new Set(links.map((l) => l.feature?.id).filter(Boolean) as string[]);
  const linkedScopeIds = new Set(links.map((l) => l.scope?.id).filter(Boolean) as string[]);
  const scopeOptions = (features ?? []).flatMap((f) =>
    f.scopes
      .filter((scope) => !linkedScopeIds.has(scope.id))
      .map((scope) => ({
        value: scope.id,
        label: scopeGroupName({ ...scope, feature: { id: f.id, name: f.name } }),
      })),
  );

  return (
    <Stack gap="xs">
      <Title order={5} className="text-text-secondary">
        Implemented by
      </Title>

      {links.length === 0 ? (
        <Text size="sm" className="text-text-muted">
          No linked tickets, features or scopes yet.
        </Text>
      ) : (
        <Stack gap={4}>
          {links.map((l) => (
            <Group key={l.id} gap="xs" wrap="nowrap">
              <Badge variant="light" color={l.ticket ? "blue" : l.scope ? "teal" : "grape"}>
                {l.ticket ? "ticket" : l.scope ? "scope" : "feature"}
              </Badge>
              <Text size="sm" className="min-w-0 flex-1 truncate">
                {l.ticket
                  ? `${l.ticket.shortId ?? `#${l.ticket.number}`} — ${l.ticket.title}`
                  : l.scope
                    ? scopeGroupName(l.scope)
                    : (l.feature?.name ?? "—")}
              </Text>
              <Text size="xs" className="text-text-muted whitespace-nowrap">
                {(l.ticket?.status ?? l.scope?.status ?? l.feature?.status ?? "").toLowerCase()}
              </Text>
              {canEdit ? (
                <Tooltip label="Unlink">
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label="Unlink"
                    loading={unlink.isPending && unlink.variables?.linkId === l.id}
                    onClick={() => unlink.mutate({ workspaceId, linkId: l.id })}
                  >
                    <IconX size={14} />
                  </ActionIcon>
                </Tooltip>
              ) : null}
            </Group>
          ))}
        </Stack>
      )}

      {canEdit ? (
        !adding ? (
          <Button
            variant="subtle"
            size="compact-sm"
            leftSection={<IconPlus size={14} />}
            onClick={() => setAdding(true)}
            className="self-start"
          >
            Link ticket, feature or scope
          </Button>
        ) : (
          <Group gap="xs" align="flex-end" wrap="wrap">
            <Select
              size="xs"
              w={180}
              label="Product"
              data={(products ?? []).map((p) => ({ value: p.id, label: p.name }))}
              value={productId}
              onChange={setProductId}
              searchable
              aria-label="Product"
            />
            <Select
              size="xs"
              w={260}
              label="Ticket"
              placeholder={productId ? "Pick a ticket…" : "Pick a product first"}
              data={(tickets ?? [])
                .filter((t) => !linkedTicketIds.has(t.id))
                .map((t) => ({
                  value: t.id,
                  label: `${t.shortId ?? `#${t.number}`} — ${t.title}`,
                }))}
              value={null}
              onChange={(ticketId) => {
                if (ticketId) linkTicket.mutate({ workspaceId, decisionId, ticketId });
              }}
              searchable
              disabled={!productId || linking}
              aria-label="Ticket"
            />
            <Select
              size="xs"
              w={220}
              label="Feature"
              placeholder={productId ? "Pick a feature…" : "Pick a product first"}
              data={(features ?? [])
                .filter((f) => !linkedFeatureIds.has(f.id))
                .map((f) => ({ value: f.id, label: f.name }))}
              value={null}
              onChange={(featureId) => {
                if (featureId) linkFeature.mutate({ workspaceId, decisionId, featureId });
              }}
              searchable
              disabled={!productId || linking}
              aria-label="Feature"
            />
            <Select
              size="xs"
              w={280}
              label="Scope"
              placeholder={productId ? "Pick a scope…" : "Pick a product first"}
              data={scopeOptions}
              value={null}
              onChange={(scopeId) => {
                if (scopeId) linkScope.mutate({ workspaceId, decisionId, scopeId });
              }}
              searchable
              disabled={!productId || linking}
              aria-label="Scope"
            />
            <Button variant="subtle" color="gray" size="compact-sm" onClick={() => setAdding(false)}>
              Done
            </Button>
          </Group>
        )
      ) : null}
    </Stack>
  );
}
