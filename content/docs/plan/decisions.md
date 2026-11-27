---
title: Decisions
description: "The Decision Log: every choice your workspace made, where it came from, what it replaced and what implements it, beside the ADRs in your repositories"
section: plan
order: 4
icon: IconFlag
updated: 2026-11-27
---

A decision is a recorded choice: a short title stating the outcome, one line saying what was decided, the context and alternatives behind it, who decided and when, and where it came from, whether a meeting, a person, or an agent. The Decision Log keeps them beside the architecture decision records (ADRs) of the repositories your workspace tracks, so "why did we do it this way?" has one answer for product and engineering alike. An open question is simply a decision that has not been made yet.

![The Decision Log](/doc-assets/decisions.png)

## Where to find it

[**Plan → Decisions**](/go/decisions) in the sidebar. Each product also has a **Decisions** tab scoped to it, and each meeting's **Decisions** tab shows what that meeting produced. ADR sync is configured at [workspace settings → **Decisions**](/go/settings/decisions).

## How to read the log

- Filter by status: **All**, **Accepted**, **Superseded**, **Proposed**, **Open**.
- Filter by source: **Code** (ADRs projected from git, read-only), **Meeting** (extracted from a transcript), **Manual** (logged by hand or by an agent).
- Filter by **Pillar** or **label**: **All Pillars** and **All labels** list what the decisions in view carry. Pick both to see decisions that carry both. ADRs are files in git and carry neither, so they are hidden while either filter is on.
- **Grouped** puts decisions under their repository, ceremony or project; **Flat** is one list. **All products** narrows to one product.
- Each row shows the decision's title, with its statement underneath. A decision logged before titles existed shows its statement.
- Search matches titles, statements and bodies.

Decisions are numbered from a workspace sequence (`D-0042`); ADRs keep their repository's prefix (`API-0003`). When two ADRs claim the same number the group shows a **conflict** badge.

## How to log a decision

1. Click **New decision**.
2. Write the **Title**: the outcome in six words or fewer, for example "Text place beats Dataminr location". State the outcome, not the topic: "Pricing" is a topic, "Pricing stays per seat" is an outcome. The title is optional, but every list reads better with one.
3. Write the **Decision** in one line, in plain words: what changes for the product or its users. Pick its status (**Accepted**, **Proposed**, or **Open question** for something still to decide) and the **Decided** date.
4. Fill in the body under the headings the editor offers: **Context**, **Alternatives considered**, **Consequences**. **Preview** renders it.
5. Click **Log decision**.

The decision's page shows the title (the pencil beside it edits the title), the statement, who decided (**Deciders**, **Owner**) and where (the ceremony or meeting), the **Evidence** quotes, the body, and five controls:

![A decision's page, with its evidence and links](/doc-assets/decision.png)

- **Change status** — move it through the lifecycle below.
- **Edit scope** — attach it to a **Product**, **Project**, **Objective** or **Key result**.
- **Add Pillars or labels** — file it under one or more Pillars, and label it. Each Pillar's page lists its decisions (see below).
- **Link ticket, feature or scope** — record what implements it. Link a scope when a decision belongs to one version of a feature; the feature's page then shows the decision with the scope's version beside it.
- **Draft ADR** — turn it into an architecture decision record for a repository.

## How a Pillar groups its decisions

A Pillar's page groups its decisions by what each is linked to: one group for each scope, feature or ticket. A scope's group is named with its feature, for example "Geocoding of signals > V5: Dataminr text location". Each group header shows the count and the newest decided date.

- **General** holds the decisions with no link, the ones that apply to the whole Pillar. It is always first and starts open.
- The other groups start collapsed, newest first. Click a header to open it.
- A decision linked to several items appears in one group only: its scope if it has one, else its feature, else its ticket.

To move a decision into a group, link it to that scope, feature or ticket from the decision's page.

## How decisions come from meetings

Open a meeting's **Decisions** tab and click **Extract decisions & questions**. Zoe drafts candidates from the notes and transcript, each with a title and the quoted turns it rests on; a candidate with no evidence is discarded, never published. Review the drafts with Zoe, confirm the real ones and reject the rest. Only confirmed decisions reach the log, with the meeting and the quotes as their provenance. See [Meetings](/docs/meet/meetings).

## How the lifecycle works

**Open** (a question) → **Proposed** → **Accepted** → **Superseded** or **Deprecated**. Superseding records the newer decision on the older one (**Superseded by**), so the chain stays readable. Use **Change status** on the decision's page; superseded and deprecated are reached from there, never at creation.

## How to see the graph

**Open graph** draws both sources in two views: a **Timeline** (time left to right, one lane per repository, ceremony or project; **Today** marked; undated items parked at the end) and a relationship view showing **supersedes**, **mentions (detected)** and **formalised as ADR** links. Click a decision to open it; use **Fit to width** and the zoom controls to move around.

## How to sync ADRs from git

1. Track the repositories under [workspace settings → Integrations](/go/settings?section=integrations) → **GitHub** (this needs the GitHub App installed by an administrator); see [GitHub, Google & Monday.com](/docs/integrations/github-google-monday).
2. Open [workspace settings → **Decisions**](/go/settings/decisions) and enrol the repositories whose `docs/adr` files should appear.
3. ADRs are projected read-only; git stays the source of truth. Their content becomes readable by every workspace member, including people without access to the repository on GitHub, so enrol deliberately.

## How it connects

- **Meetings** — the main source of decisions: [Meetings](/docs/meet/meetings).
- **Ceremonies** — a ceremony's occurrences collect the decisions made in them; grouped view shows decisions under their ceremony.
- **Products** — tickets and features implement decisions: [Products](/docs/build/products).
- **Goals** — decisions can be scoped to an objective or key result: [OKRs](/docs/plan/okrs).
- **CLI** — `exponential decisions` lists, logs, links and moves decisions, including `decisions draft extract` for meetings.

## FAQ

**Can I edit an ADR here?**
No. ADRs are read-only projections of files in git; change the file in the repository.

**Who can log decisions?**
Workspace members. Drafts an agent proposed are visible only until someone confirms or rejects them.

**What is the difference between an open question and a proposed decision?**
An open question has no answer yet; answering it turns it into a decision. A proposed decision is a specific answer awaiting acceptance.
