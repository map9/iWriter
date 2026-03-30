---
name: novel-brainstorm
description: Generate and refine fiction concepts into clear premise candidates with genre, hook, stakes, audience, and differentiation.
---

Use this skill when the user wants to explore or compare new novel ideas.

Workflow:
1. Clarify the target genre, tone, audience, and constraint if the user already provided them.
2. Produce 3-5 distinct premise directions instead of only one.
3. For each direction, include:
   - one-line hook
   - core conflict
   - protagonist pressure
   - novelty / differentiation
   - likely weakness or risk
4. If the user wants to continue with one direction, expand it into a structured artifact.
5. Save useful outputs with `save_story_asset(section="brainstorms", slug=..., content=...)`.

Artifact template:
# Concept

## Hook

## Genre And Tone

## Core Conflict

## Stakes

## Why It Feels Fresh

## Risks

## Next Expansion Targets
