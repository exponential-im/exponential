"use client";

import { Button, Group, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";
import { Panel, Pill, SectionHeader } from "~/app/_components/ui";
import { OUTCOME_RESULT_LABELS, isOutcomeResult } from "~/server/services/cycleBriefs/types";

/**
 * Planning step for the Product owner: last cycle's outcomes, each to carry
 * over or leave behind. Nothing rolls over on its own (D-0098).
 */
export function CarryOverSection({ briefId, onCarried }: { briefId: string; onCarried: () => Promise<void> }) {
  const utils = api.useUtils();
  const { data } = api.product.cycleBrief.carryOverCandidates.useQuery({ briefId });
  const carryOver = api.product.cycleBrief.carryOver.useMutation({
    onSuccess: async () => {
      await utils.product.cycleBrief.carryOverCandidates.invalidate({ briefId });
      await onCarried();
    },
    onError: (err) => notifications.show({ color: "red", title: "Carry over", message: err.message }),
  });

  if (!data || data.outcomes.length === 0) return null;
  const open = data.outcomes.filter((o) => o.result !== "achieved");
  if (open.length === 0) return null;

  return (
    <div className="mt-5">
      <SectionHeader title={`Carry over from ${data.cycleName}`} className="mb-2" />
      <Text size="xs" className="mb-2 text-text-muted">
        Unfinished outcomes do not roll over by themselves. Carry one over, or leave it behind.
      </Text>
      <Stack gap="xs">
        {open.map((o) => (
          <Panel key={o.id} variant="muted" padding="sm">
            <Group justify="space-between" wrap="nowrap">
              <div>
                <Text size="sm" className="text-text-primary">
                  {o.text}
                </Text>
                {isOutcomeResult(o.result) && (
                  <Pill tone="neutral" size="xs" className="mt-1">
                    {OUTCOME_RESULT_LABELS[o.result]}
                  </Pill>
                )}
              </div>
              {o.isCarried ? (
                <Pill tone="brand" size="xs">
                  Carried over
                </Pill>
              ) : (
                <Button
                  size="compact-xs"
                  variant="light"
                  loading={carryOver.isPending && carryOver.variables?.outcomeId === o.id}
                  onClick={() => carryOver.mutate({ outcomeId: o.id, toBriefId: briefId })}
                >
                  Carry over
                </Button>
              )}
            </Group>
          </Panel>
        ))}
      </Stack>
    </div>
  );
}
