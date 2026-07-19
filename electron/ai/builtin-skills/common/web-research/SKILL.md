---
name: web-research
description: Research methodology for source-grounded lookup — load when conducting web research (verifying facts; gathering background on people/works/places/professions/history/culture). Covers planning the question, searching and reading efficiently, and grounding every claim in a source. The deliverable format and return contract belong to the executing agent (e.g. the Researcher's agent.md), not here.
---

# web-research

How to do source-grounded lookup well. This is methodology only — the brief contract, the deliverable location/format, and the red lines are defined by the agent that runs the research (the Researcher's `agent.md`); this skill does not restate them.

## Plan first

Break the question into 2–5 distinct, non-overlapping sub-questions before searching. Scale the breadth to the task: simple fact-finding = 1–2 sub-questions; a comparison = one per element (max 3); a broad investigation = 3–5. Don't over-research — a few good searches per sub-question is usually enough; stop when the answer is grounded, not when you run out of queries.

## Search and read

- Use `web_search` to find sources (clear queries, no unexplained acronyms), then `fetch_url` to read a promising page in full — `fetch_url` is for URLs; do not point `read_file` at a URL. If the caller attached local files, read those first with `read_file`.
- Prefer primary and reputable sources; corroborate a load-bearing claim across more than one source, and flag when it rests on a single weak one.
- Track the source URL for every fact as you go — each finding must stay traceable to where it came from.

## Ground every claim

- Separate **observed evidence** from **your interpretation** — keep them visibly distinct.
- Attach sources (URLs) to non-obvious claims; keep quoted excerpts short.
- Report confidence and **information gaps** — what could not be confirmed or is contested is itself a finding, not a failure. Never fabricate a fact, source, or quote to fill a gap.
