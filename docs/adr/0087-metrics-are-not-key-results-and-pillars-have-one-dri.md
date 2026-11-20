# Metrics are not Key results, and a Pillar has one DRI

## Status

Accepted on 2026-11-20. Amends [ADR-0086](0086-pillars-are-promoted-tags.md), which made Positions the only
accountability a Pillar shows. Decided in the 2026-11-19 grilling on Pillar metrics. The
human-only DRI rule was cut on 2026-11-20.

## Context

A Pillar is a standing area of work that never finishes, but its page can only show numbers
through **Key results**, and they're the wrong shape for that. A Key result expires with its
period, renders as progress %, can't read "lower is better", never flags data that stopped
arriving, and has no one to notify, because nobody is accountable for a Pillar as a whole.
ADR-0086 lets a Pillar list Positions only as "who to ask" and never routes anything through
them.

The CLEAR evidence: prod GlitchTip stored no errors for about 8 days and nobody noticed. Setting
up the CLEAR DevOps Pillar, about half of its 12 Key results turned out to be standing health
measures forced into a quarter: crash-free sessions, uptime, old unresolved issues and the gap
in error reporting.

## Decision

**A Metric is its own concept: a standing number owned by one Pillar, not a kind of Key result.**

- **What a Metric has:** a direction, a healthy line, a breached line, an optional warning band
  and an update cadence.
- **Its state is derived on read:** healthy, warning or breached. It's stale once a value is
  overdue by half its cadence again, and stale outranks every other state. Changing its lines
  applies from then on, and past states are never recomputed.
- **Key results can name the Metric they move.** Recording a Metric value checks the same value
  in on every open linked Key result, so check-ins stay the only write path for Key-result values
  (ADR-0050).

**A Pillar has exactly one DRI**, stored on the Pillar's tag (`Tag.driUserId`). The DRI is the
person told when one of the Pillar's Metrics moves into or out of breached or stale.

- **Only a human member of the workspace can be DRI.** A notification to an agent's inbox reaches
  nobody.
- **A Pillar without a DRI is flagged**, the same way a Pillar without Positions is.
- **Positions stay display-only** (ADR-0086). The DRI is a separate field, shown above them.

## Considered alternatives

- **A "standing" Key result** (no Objective, no period, plus a flag). This breaks the rule that a
  Key result has exactly one Objective. Every OKR view, filter, stat and roll-up would need an
  exception, and "achieved" means nothing for uptime.
- **Notifying the Pillar's Position holders.** This contradicts ADR-0086's "shown, never routed",
  and alerts fan out to several people.
- **A DRI per Metric.** James chose one accountable person per Pillar.
- **Linking a Key result to a Metric for context only.** That means entering every value twice,
  and the two drift apart.
- **Agents as DRI.** Left open by the PRD. Ruled out for now because nobody reads an agent's
  inbox. Revisit if agents get an escalation path.

## Consequences

- **The schema adds one migration:** `Metric`, `MetricValue`, `MetricChange`, `Tag.driUserId` and
  `KeyResult.metricId`.
- **State lives in one pure derivation.** `Metric.lastState` only caches it so transitions can be
  detected for notifications.
- **Metrics need a scheduled job.** Staleness has to be noticed when nobody records anything, so
  an hourly cron re-evaluates Metrics.
- **Agent shadow users can't be offered as DRI,** so pickers that offer one filter them out.
