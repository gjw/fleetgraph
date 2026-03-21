# Final Video — Notes for Script

Starting point: `notes/video-script-early.md`. Same structure, updated for what landed since early submission.

---

## New Features to Demo

### Cadenced Proactive Scans (fg-8iu)

**Why it matters for the video:** This is production thinking, not demo-ware. Shows the agent is cost-aware and matches detection urgency to the condition's natural rhythm.

**Demo approach:** Run `pnpm fg:scan hot` and `pnpm fg:scan daily` back-to-back in terminal. Show:

- Hot scan finishes in ~5s, produces only scope_creep/blocked_chain findings (gpt-4o-mini)
- Daily scan takes longer, produces stale_triage/accountability/overloaded findings (gpt-4o)
- Different findings, different models, different token counts — visible in LangSmith traces side by side

**Key talking points:**

- "The MVP polls every 5 minutes for everything. That's simultaneously too slow for scope creep and too fast for stale triage."
- "Hot loop catches scope creep in seconds — while the PM is still on the page. Daily digest sends one morning roll-up for slow-moving conditions like triage staleness."
- "Hot uses gpt-4o-mini with a focused 2-type prompt. Daily uses gpt-4o with the full workspace. Cost drops from ~$14/day to ~$3/day with BETTER detection quality."
- "Each cadence has a focused prompt — the LLM isn't trying to detect everything at once, so it catches things the kitchen-sink prompt missed."

**LangSmith traces:** Show a hot trace vs daily trace side by side. Hot trace should be visibly smaller (fewer tokens, faster). Call out: "Different graph runs, different data scoped in, different models."

---

## Updates to Early Script Sections

(Add notes here as other features land)

### On-demand chat responsiveness (fg-1ry)

If this lands: update Section 4/5 to show the chat actually answering the question instead of dumping findings.

### Predefined action buttons (fg-rh9)

If this lands: show buttons instead of typing in the chat. "Users don't have to guess what to ask."

---

## Cost Analysis Section

New for final. Show the cadence cost table from FLEETGRAPH.md. Walk through the before/after.
