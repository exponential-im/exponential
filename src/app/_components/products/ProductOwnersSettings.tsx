"use client";

import { useEffect, useState } from "react";
import { Button, Group, MultiSelect, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";

/**
 * Product owners (D-0092): the people who sign off this product's Cycle
 * briefs. Only workspace owners and admins can change the list, and only
 * people, never Assistants or agents, can be on it.
 */
export function ProductOwnersSettings({ productId }: { productId: string }) {
  const utils = api.useUtils();
  const { data: owners } = api.product.cycleBrief.listProductOwners.useQuery({ productId });
  const { data: candidates } = api.product.cycleBrief.listOwnerCandidates.useQuery({ productId });
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (owners) setSelected(owners.map((o) => o.id));
  }, [owners]);

  const save = api.product.cycleBrief.setProductOwners.useMutation({
    onSuccess: async () => {
      notifications.show({ title: "Product owners saved", message: "They can now sign off Cycle briefs." });
      await utils.product.cycleBrief.listProductOwners.invalidate({ productId });
      await utils.product.cycleBrief.getForCycle.invalidate();
    },
    onError: (err) => notifications.show({ color: "red", title: "Could not save", message: err.message }),
  });

  const data = (candidates ?? []).map((u) => ({ value: u.id, label: u.name ?? u.email ?? "Unnamed" }));
  const unchanged =
    owners !== undefined &&
    selected.length === owners.length &&
    owners.every((o) => selected.includes(o.id));

  return (
    <Stack gap="sm">
      <MultiSelect
        label="Product owners"
        description="They sign off each Cycle brief before it goes public, and any later change to its outcomes."
        placeholder={selected.length === 0 ? "Pick one or more people" : undefined}
        data={data}
        value={selected}
        onChange={setSelected}
        searchable
        clearable
      />
      {owners?.length === 0 && (
        <Text size="xs" className="text-text-muted">
          No Product owner yet: this product&apos;s Cycle briefs cannot be signed off or published.
        </Text>
      )}
      <Group>
        <Button
          size="sm"
          disabled={unchanged}
          loading={save.isPending}
          onClick={() => save.mutate({ productId, userIds: selected })}
        >
          Save owners
        </Button>
      </Group>
    </Stack>
  );
}
