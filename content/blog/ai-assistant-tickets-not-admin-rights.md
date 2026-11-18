---
title: "We Gave Our AI Assistant Tickets, Not Admin Rights"
description: "How our AI assistant takes assigned work: its own identity, tools restricted by construction, a question when it's stuck, and it never closes the work."
date: "2026-11-17"
author: "James Farrell"
tags: ["AI agents", "engineering", "architecture", "security"]
---

The easiest way to give an AI assistant real work is to hand it your session. It can do everything you can, so it can do the job. It can also do everything else you can, which is the problem.

When we built "assign an action to your assistant" in Exponential, we started from the other end. What's the smallest amount of power an assistant needs to be useful on one task, and how do we make the rest impossible rather than merely discouraged?

Here's what we ended up with, and why.

## Three kinds of agent, kept apart

Exponential already had two kinds of AI. Zoe in chat acts as *you*: she drafts, you confirm, and anything she writes is yours. External agents (Claude, Cursor, Codex, a script you wrote) connect with their own key and act under their own name.

The assistant you assign work to is a third thing. It gets its own principal: a shadow user owned by you, with its own name on everything it writes. When you assign it an action, the app creates a run and mints a token for that one run. The token carries the run's id, and every callback the assistant makes checks three things: the token is a run token, the run belongs to this assistant, and the run is still running. No tool takes a run id as input, so there's nothing to forge.

The practical upshot is that you can always tell who did what. A comment from your assistant says it's from your assistant. A change it made shows up in the activity feed under its name, not yours.

## Guardrails in the tools, not the prompt

Every agent framework has a system prompt that says something like "never send email without permission". That's a request, not a control. Prompts get injected, misread and ignored.

So the assistant's tool map is restricted by construction. During an assigned run it has no tool to send or reply to email, create calendar events, write to Notion or the CRM, post to Slack or WhatsApp, or delete OKRs. It can't do those things however the task is phrased, because the functions aren't there. The prompt still mentions the policy, but the prompt isn't what enforces it.

What it *can* do is work inside Exponential: read what it needs, comment, edit fields, create sub-actions, and hand the action to someone else. Even that last one is fenced. When it reassigns, the check runs as you, so the assistant can assign exactly the people you could, and no one else.

## It asks instead of guessing

A model that hits missing information has two options: guess confidently, or stop. Guessing feels more helpful, right up until you're unpicking a wrong answer that looked right.

When our assistant is stuck, it posts a comment that @mentions whoever assigned the action (you, if nobody did) and parks the run as *waiting on owner*. Your reply in the comments starts a new run that picks up where it left off, with the previous run's summary and your reply in its brief. The question shows up in your inbox under "Waiting on me", next to the other things only you can unblock.

It's slower than guessing. It's also the difference between an assistant you check every five minutes and one you can leave alone.

## It never closes the work

This is the rule people push back on most. The assistant can finish its run and say the action looks ready to close, but it never marks the action done. You do.

That's deliberate. "Done" is a claim about the world, not about the assistant's transcript. Booking the venue, fixing the bug and sending the deck all need a human to look at the result. So a finished run lands in your inbox's **Delegated** tab with a summary, and you either mark it done or dismiss it. The run also leaves a proposed time entry for the minutes it spent, which you confirm or delete, because agent time is still time someone is paying for.

## Watching it work

A spinning ring replaces the action's status dot while a run is live, and a pill above the activity feed reads something like "Aria · Working 1m · called 3 tools". You can cancel from the pill at any time. When it's done the pill says how long it worked and how many tools it called, with the summary on hover. As the owner you can expand the full transcript and see each step. Teammates see the pill and the summary, but not the transcript.

## The boring parts that make it reliable

A few details that don't make good demos:

- **One live run per action and assistant.** A partial unique index in Postgres enforces it, so assigning twice, or assigning while a run is in flight, can't start a second run.
- **Runs are bounded.** The hosted agent gets twelve steps inside a five-minute function. A run that stops sending heartbeats for five minutes is marked timed out by a sweep that runs every minute.
- **Cancel wins.** Cancelling flags the run. Any late result from the model is discarded, and callbacks refuse a run that isn't running.
- **Your machine, if you prefer.** An assistant can be set to run on a local runner instead of our hosted agent service. A process on your machine claims runs with the assistant's key and reports progress through the same API, and the UI can't tell the difference.

## What we'd tell anyone building this

Give the agent an identity of its own, so attribution is free. Take capabilities away in code, not in the prompt. Make "I'm stuck" a first-class outcome with a way back in. And keep the last step, saying the work is done, for a person.

If you want to try it, the docs explain [how to hand an action to your assistant](/docs/zoe/assistant-runs). If you'd rather bring your own agent, Claude, Cursor and Codex connect through the [MCP server, CLI and SDK](/features/integrations), each under its own name too.
