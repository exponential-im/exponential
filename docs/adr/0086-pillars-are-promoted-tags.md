# Pillars are promoted tags

## Status

Accepted — 2026-11-17. Reverses the part of the 2026-10-10 Reading list decision that rejected
"Pillar" as a noun. Decided in a design session before any code; nothing is built yet.

## Context

Projects are finite: they have a status, progress and a review cadence, and the glossary already
forbids using one as a bucket that never finishes. Some work has no end, though. DevOps,
go-to-market, onboarding and access, engineering management, or in a Personal workspace health,
learning and reading. That work ended up in fake forever-Projects ("Exponential GTM"), in Epics
that can never close ("Production observability and resilience" in CLEAR, whose description tells
people to add an `observability` label as well), or in project-less Actions with no home at all.
The Chrome extension shows the same gap: its Workspace → Goal → Project picker has no answer for
"this belongs to DevOps".

On 2026-10-10 "Pillar" was rejected because **LifeDomain** was taken to be the standing-area
concept. It is not one a team can use. LifeDomain is a single global, seeded set of ten Wheel of
Life categories with no workspace and no way to add to it, so no workspace can create "DevOps".

Meanwhile tags already behave the way a Pillar needs to: a Tag belongs to a workspace, attaches to
Actions, Tickets, Features and Epics, allows several per item with none ranked, and is already used
this way. "DevOps" is a plain tag in three workspaces. Tags also have an `area` category, with a
ticket-board "group by Area", that no workspace has ever used.

## Decision

**A Pillar is a workspace tag promoted to have its own page.**

- **Promotion is deliberate and per tag.** Most tags are workflow states, types or repository
  names, and stay labels. Nothing is converted in bulk.
- **Pillar replaces the unused `area` tag category.** The ticket board's "group by Area" becomes
  "group by Pillar". Feature **Areas** (ADR-0040) keep their name and meaning.
- **Workspace-owned and flat.** Same-named Pillars in two workspaces are separate. No groups, no
  value tags; an active flag retires one without losing its history.
- **Several per item, all equal, or none.** Tags extend to Projects, Goals, recurring tasks and
  Resources, alongside the Actions, Tickets, Features and Epics they already reach. Contents of a
  Project or Epic take its Pillars plus any of their own.
- **Independent of Product.** A Project can carry a Product, Pillars, both or neither.
- **Positions are shown, not routed.** A Pillar lists any number of Positions so people know who
  to ask. Routing stays with Zoe's Remit matching.
- **LifeDomain is unchanged** and stays the fixed Wheel of Life set. Pillars do not link to it.

## Considered alternatives

- **A separate Pillar entity.** Cleaner to explain, but existing DevOps tags on tickets would need
  converting, and the tag and the Pillar of the same name would drift apart.
- **Rebuilding LifeDomain into Pillar** (add a workspace, seed Personal workspaces with the ten
  categories). Its grain is wrong in both directions: "Learning" and "Reading" both collapse into
  "Personal Growth", and no category fits DevOps or GTM. It would also force a remap of Wheel of
  Life scores.
- **Positions as the home for ongoing work.** A pillar is served by many Positions, so making the
  Position the container conflates who is accountable with where the work lives.
- **One Pillar per item.** Gives one answer to "where does this live", but forces a wrong choice
  for work that genuinely serves two areas, such as a weekly game that is both health and fun.

## Consequences

- Promoted and unpromoted tags share one picker, so the two must look different, or people will
  treat "bug" and "DevOps" as the same kind of thing.
- A Project's or Epic's work can appear on Pillar pages the container itself is not under.
- Converting a fake forever-Project or never-closing Epic into a Pillar is manual; a long-running
  Project with no end date gets a prompt suggesting it.
- The capture picker becomes Workspace → Pillars → optional Project, and the Goal dropdown leaves
  capture.
