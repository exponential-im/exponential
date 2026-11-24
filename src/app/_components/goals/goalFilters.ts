import { IconActivity, IconCircleDot, IconUser } from "@tabler/icons-react";
import type { FilterBarConfig, FilterState } from "~/types/filter";
import { PillarIcon } from "~/app/_components/pillars/PillarIcon";
import {
  effectiveStatus,
  objectiveEffectiveConfidence,
  type Confidence,
} from "~/plugins/okr/client/utils/okrDashboardUtils";

/** URL query params the Goals page FilterBar owns. */
export const GOAL_FILTER_KEYS = ["status", "health", "driId", "pillar"] as const;

/** The Pillar filter's value for "filed under no Pillar". Not a tag id. */
export const NO_PILLAR_FILTER_VALUE = "none";

/** Archived is never offered: archived objectives are hidden everywhere. */
export const STATUS_FILTER_OPTIONS = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
];

export type HealthFilterValue = "on-track" | "at-risk" | "off-track" | "no-update";

export const HEALTH_FILTER_OPTIONS: { value: HealthFilterValue; label: string }[] = [
  { value: "on-track", label: "On track" },
  { value: "at-risk", label: "At risk" },
  { value: "off-track", label: "Off track" },
  { value: "no-update", label: "No update" },
];

const CONFIDENCE_TO_HEALTH: Record<Confidence, HealthFilterValue> = {
  ok: "on-track",
  warn: "at-risk",
  bad: "off-track",
  idle: "no-update",
};

/**
 * The fields the Goals page filters read — a projection both row shapes
 * (the Table's goal rows and the OKRs view's card objectives) satisfy, so
 * the shell filters once and hands the result to whichever body is mounted.
 */
export interface GoalLike {
  title: string;
  description?: string | null;
  status: string;
  driUserId?: string | null;
  health?: string | null;
  healthOverride?: string | null;
  keyResults?: ReadonlyArray<{ status: string; statusOverride?: string | null }>;
  /** The Pillars the goal is filed under (ADR-0086). */
  pillarTags?: ReadonlyArray<{ tagId: string }>;
}

/**
 * True when an item filed under `pillarIds` passes the Pillar filter: it is
 * under at least one selected Pillar, or carries none while "No Pillar" is
 * selected. An empty selection passes everything.
 */
export function matchesPillarFilter(
  pillarIds: readonly string[],
  selected: readonly string[] | undefined,
): boolean {
  if (!selected || selected.length === 0) return true;
  if (pillarIds.length === 0) return selected.includes(NO_PILLAR_FILTER_VALUE);
  return pillarIds.some((id) => selected.includes(id));
}

/**
 * The health bucket an objective's badge shows (ADR-0004: override, then the
 * auto cache, then a worst-KR roll-up) — the same resolver the OKR card uses,
 * so a card badged "On track" always survives the "On track" filter.
 */
export function goalEffectiveHealth(goal: GoalLike): HealthFilterValue {
  return CONFIDENCE_TO_HEALTH[
    objectiveEffectiveConfidence(
      goal.healthOverride,
      goal.health,
      (goal.keyResults ?? []).map(
        (kr) => effectiveStatus(kr.statusOverride, kr.status) ?? "",
      ),
    )
  ];
}

export function filterGoalRows<T extends GoalLike>(
  goals: T[],
  filters: FilterState,
  searchQuery: string,
): T[] {
  const q = searchQuery.trim().toLowerCase();
  const status = filters.status as string[] | undefined;
  const health = filters.health as string[] | undefined;
  const dri = filters.driId as string[] | undefined;
  const pillar = filters.pillar as string[] | undefined;
  return goals.filter((g) => {
    if (status && status.length > 0 && !status.includes(g.status)) return false;
    if (health && health.length > 0 && !health.includes(goalEffectiveHealth(g))) {
      return false;
    }
    if (dri && dri.length > 0) {
      if (!g.driUserId || !dri.includes(g.driUserId)) return false;
    }
    if (!matchesPillarFilter((g.pillarTags ?? []).map((t) => t.tagId), pillar)) {
      return false;
    }
    if (q) {
      const haystack = `${g.title} ${g.description ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/** Status, Health and Owner. No Target: the period switcher scopes the list. */
export const GOAL_FILTER_CONFIG: FilterBarConfig = {
  fields: [
    {
      key: "status",
      label: "Status",
      type: "multi-select",
      icon: IconCircleDot,
      badgeColor: "gray",
      options: STATUS_FILTER_OPTIONS,
    },
    {
      key: "health",
      label: "Health",
      type: "multi-select",
      icon: IconActivity,
      badgeColor: "green",
      options: HEALTH_FILTER_OPTIONS,
    },
    {
      key: "driId",
      label: "Owner",
      type: "user",
      icon: IconUser,
      badgeColor: "blue",
    },
  ],
};

export interface PillarFilterOption {
  id: string;
  name: string;
  archivedAt?: Date | string | null;
}

/**
 * The Goals page filters with a Pillar field added when the workspace has
 * Pillars. An inactive Pillar is still offered, marked as such: goals keep it,
 * so it still narrows the list. With no Pillars the field is left out, unless
 * the URL or saved view still selects one, so that selection can be seen and
 * cleared.
 */
export function buildGoalFilterConfig(
  pillars: readonly PillarFilterOption[],
  filters: FilterState,
): FilterBarConfig {
  const selected = filters.pillar;
  const hasSelection = Array.isArray(selected) && selected.length > 0;
  if (pillars.length === 0 && !hasSelection) return GOAL_FILTER_CONFIG;
  return {
    fields: [
      ...GOAL_FILTER_CONFIG.fields,
      {
        key: "pillar",
        label: "Pillar",
        type: "multi-select",
        icon: PillarIcon,
        badgeColor: "grape",
        options: [
          ...pillars.map((p) => ({
            value: p.id,
            label: p.archivedAt ? `${p.name} (inactive)` : p.name,
          })),
          { value: NO_PILLAR_FILTER_VALUE, label: "No Pillar" },
        ],
      },
    ],
  };
}
