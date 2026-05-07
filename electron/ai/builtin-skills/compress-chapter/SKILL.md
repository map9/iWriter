---
name: compress-chapter
description: Extract structured novel state from one chapter.
---

# Compress Chapter

You extract structured story state from one chapter of a novel.

Return **only valid JSON**. Do not return Markdown, YAML, comments, or explanatory text.

## Required Output Shape

```json
{
  "characters": [
    {
      "id": "li-ming",
      "type": "character_card",
      "name": "李明",
      "aliases": ["小李"],
      "role": "protagonist",
      "appearance": "short concrete appearance description",
      "personality": "short concrete personality description",
      "relationships": [],
      "state_by_chapter": [
        { "chapter_id": "ch01", "status": "arrives at the archive and hides the letter" }
      ],
      "confidence": 0.85,
      "updated_at": "2026-05-07T00:00:00.000Z",
      "source_refs": [
        { "file": "novel.md", "chapter_id": "ch01", "block_id": 12 }
      ]
    }
  ],
  "scenes": [
    {
      "id": "ch01--001",
      "type": "scene_card",
      "chapter_id": "ch01",
      "sequence": 1,
      "time": "night",
      "location": "archive",
      "characters": ["li-ming"],
      "summary": "李明 enters the archive and finds a hidden letter.",
      "beats": [
        "李明 enters the archive.",
        "He finds a hidden letter."
      ],
      "tone": "suspenseful",
      "foreshadowing_ids": [],
      "confidence": 0.85,
      "updated_at": "2026-05-07T00:00:00.000Z",
      "source_refs": [
        { "file": "novel.md", "chapter_id": "ch01", "block_id": 12 }
      ]
    }
  ],
  "timeline": {
    "id": "ch01",
    "type": "timeline_chapter",
    "chapter_id": "ch01",
    "events": [
      {
        "id": "ch01-event-001",
        "time": "night",
        "event": "李明 enters the archive.",
        "characters": ["li-ming"],
        "chapter_id": "ch01",
        "is_turning_point": false,
        "source_refs": [
          { "file": "novel.md", "chapter_id": "ch01", "block_id": 12 }
        ],
        "confidence": 0.85
      }
    ],
    "confidence": 0.85,
    "updated_at": "2026-05-07T00:00:00.000Z"
  }
}
```

## Rules

1. `confidence` must be a number between 0 and 1, never a string.
2. Every `source_refs[].block_id` must come from the provided block list.
3. Use the provided `chapter_id` exactly.
4. Character ids should be stable lowercase slugs, such as `li-ming`.
5. Scene ids should use `{chapter_id}--001`, `{chapter_id}--002`, and so on.
6. If timeline confidence is low, still return it with a low numeric `confidence`.
7. If uncertain, keep the item but lower its `confidence`; do not invent unsupported details.
