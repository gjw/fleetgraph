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

### WebSocket Event Trigger (fg-26l)

**Why it matters for the video:** Turns FleetGraph from a polling agent into a reactive one. The demo moment is visceral — you DO something in Ship and FleetGraph responds before you leave the page.

**Demo approach:** Split screen — Ship UI on left, FleetGraph terminal logs on right. Do this:

1. Open a sprint page in Ship
2. Add an issue to the sprint
3. Watch the terminal: within 30 seconds, `[listener] dispatching hot scan — ws-<timestamp>` appears
4. Finding surfaces in the inbox

**Key talking points:**

- "The 5-minute poll meets the PRD requirement technically. But watch what happens with WebSocket triggers — I add an issue to this sprint, and FleetGraph detects scope creep before I even navigate away."
- "Events flow through Ship's existing /events WebSocket. FleetGraph connects as a service listener — it hears every accountability event across the workspace. No new infrastructure, no message queue, just a WebSocket connection."
- "The 30-second debounce is deliberate. A PM adding 5 issues to a sprint in rapid succession produces one scan, not five. That's one LLM call instead of five — same detection, 80% less cost."
- "The poll doesn't go away — it's the safety net. If the WebSocket drops, the poll catches up within 5 minutes. After every WS-triggered scan, the poll timer resets so you don't get duplicate work."

**LangSmith traces:** Show a WS-triggered trace — the triggerId starts with `ws-` instead of `hot-`. Call out: "Same graph, same analysis, but triggered by a real event instead of a timer. Detection latency went from up to 5 minutes to under 30 seconds."

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
