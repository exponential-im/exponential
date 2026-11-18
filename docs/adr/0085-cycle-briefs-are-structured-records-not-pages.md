# Cycle briefs are structured records, not Pages

## Status

Accepted — 2026-11-18. Decision D-0096 in the `exponential` product. Feature: "Cycle brief: a public plan and release notes for each cycle" (`cmwmckym2000ok108w0zio5da`).

## Context

A **Cycle brief** is one public, plain-language page per **Cycle**: a plan written at cycle planning and release notes written at close. Its readers are outside the team: a **Product owner**, users, funders. The brief changes every week, because each **Cycle outcome** gets a new status at the weekly check-in.

The obvious build is the one **Workspace updates** use ([ADR-0064](0064-workspace-updates-owner-approved-pages.md)): a Knowledge Page as the draft, with the approved title and body frozen as a snapshot (`approvedTitle` / `approvedBody`) that `/updates/<workspace>` serves. That holds a sign-off gate for a post approved once. It does not fit a brief, which mixes two kinds of change in one page: changes to its outcomes and the release notes need sign-off (D-0091), but weekly status must go live without it. One frozen body cannot publish one part and hold back the other. A plain **Published page** ([ADR-0038](0038-page-public-publishing.md)) is worse: it renders the live body, so it holds no gate at all.

## Decision

1. A Cycle brief is stored as structured records: its outcomes (each with a why, a status set by a person, optional Feature links and at most one Objective link), its "Not this cycle" items (each with a reason and an optional Insight), and its release notes.
2. The brief keeps a **signed-off version** apart from the draft. The public route renders the signed-off version, plus the current weekly status of each outcome. A changed outcome shows the date it changed.
3. Each **Product** has one stable public URL that lists its briefs, newest first. Readers bookmark one link, not a new link every cycle.

## Considered options

- **Knowledge Page draft + approved snapshot (as ADR-0064).** Rejected: a snapshot gates the whole body, so weekly status would need re-approval or bypass the gate. Status, Feature, Objective and Insight links, results and carry-over would become free text that the ceremony agenda and the close cannot read.
- **Published page per brief, no index.** Rejected: it renders the live body, so it holds no gate, and readers would need a new link every cycle.

## Consequences

- The brief cannot be edited in the page editor with inline comments, as Workspace update drafts are. Sign-off needs its own review screen.
- The release notes reuse Workspace update selection and story code (D-0093) but write into the brief's records, not into a Page.
