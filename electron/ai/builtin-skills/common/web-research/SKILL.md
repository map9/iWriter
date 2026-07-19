---
name: web-research
description: Use when a request needs web research, fact verification, comparison, background investigation, or source-grounded synthesis from web, local, or knowledge-base materials.
---

# Web Research

Use the available evidence tools directly. There is no dedicated Researcher subagent: for complex research, the main agent plans and synthesizes while `general-purpose` subagents investigate independent subtopics.

## Route the request

- **Simple lookup:** answer directly, with inline sources, when one or two focused retrieval calls can answer one narrow factual question. Do not create a temporary research report.
- **Complex research:** use the process below for a report, comparison, multi-part question, supplied-material or knowledge-base/RAG research, or any request needing several evidence branches or synthesis.

## Research Process

### Step 1: Create and Save Research Plan

Before delegating:

1. Create a session-scoped folder under `/large_tool_results/research_<topic_name>/`. Use a concise, filesystem-safe topic name; if it already exists, add a suffix.
2. Break the question into 2–5 specific subtopics. Each subtopic answers one distinct question and has a clear boundary so workers do not repeat work.
3. Write `/large_tool_results/research_<topic_name>/research_plan.md` with the original question, scope, subtopics, expected evidence, and how the results will be combined.

Guidelines:

- Simple fact-finding: 1–2 subtopics.
- Comparison: one subtopic per comparison element, at most 3.
- Broad investigation: 3–5 subtopics.
- Personal knowledge-base or story-material research: separate supplied facts, external background or verification, and gaps or conflicts.

### Step 2: Delegate to Research Subagents

Delegate one independent subtopic to each `general-purpose` subagent. Run up to 3 subagents in parallel. If there are more subtopics, read and assess the first batch before starting the next one.

Each brief must include:

- A specific question and its boundary.
- The preferred evidence order: user-provided materials, knowledge-base/RAG results, primary or official sources, then reputable secondary sources.
- A small query set: a discovery query, a verification query, and a gap or conflict query only when needed. Include relevant date, location, edition, or version constraints.
- The exact result path: `/large_tool_results/research_<topic_name>/findings_<subtopic>.md`.

```text
task(subagent_type="general-purpose", description="""
Research this subtopic only: <question and boundary>.

Read supplied materials first, then use available knowledge-base/RAG tools. Use web_search for discovery and fetch_url to read promising pages. Do not delegate again.

Write /large_tool_results/research_<topic_name>/findings_<subtopic>.md with:
- question and scope
- findings, separating observed evidence from interpretation
- source URLs, local file locators, or RAG locators
- confidence and unresolved gaps or conflicts

Return only: status, result path, and a concise summary.
""")
```

Workers write only their findings file. They do not write the plan, final report, or user-facing documents.

### Step 3: Synthesize Findings

After all workers complete:

1. Read all findings files before synthesizing. Do not treat worker return summaries as evidence.
2. Combine findings by the original question, deduplicate sources, and state material conflicts or gaps instead of silently choosing a side.
3. Write `research_report.md` at `/large_tool_results/research_<topic_name>/research_report.md`. It must directly answer the question and include findings, source links or locators, confidence, and limitations.
4. Give the user a concise answer based on the report. Creating or updating a document in the user workspace is a separate main-agent decision.

## Evidence Rules

- Prefer user-provided and knowledge-base evidence before web sources.
- Keep every non-obvious claim traceable to a source. Keep quotations short.
- Never fabricate facts, sources, URLs, locators, or quotes.
- Stop when the scoped question is grounded; report what could not be confirmed.
