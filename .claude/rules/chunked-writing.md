---
description: Chunked writing protocol for agents that produce long-form documents (specs, plans). Agents reference this rule to avoid duplicating the same incremental-write instructions.
paths: [".claude/agents/*.md"]
---

# Chunked Writing Protocol

When an agent produces a multi-section document (spec, plan, etc.), it MUST write the document **incrementally by section** — never in a single tool call. This avoids tool-call size limits and keeps each write reviewable.

## Marker

All document types use the same marker: `<!-- §§CONTINUE§§ -->`

Do not vary this string.

## Core Rules

1. **One logical group of sections per tool call.** Each call writes one or two related sections. The grouping follows the agent's own document structure definition.
2. **First call creates the file**, writing the opening sections and ending with the marker.
3. **Subsequent calls replace the marker** with new content plus a fresh marker.
4. **Final call omits the marker.** The finished document must not contain it.
5. **Only the output file may contain this marker** — never inject it into source files, specs being read, or chat output.
