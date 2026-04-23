---
name: split-plan
description: Use when you need to divide a large iplan/replan implementation plan into N independently implementable and verifiable sub-plans, each with its own programmatic acceptance criteria and a final unified acceptance document.
---

# Split Plan

Divide a large implementation plan (iplan/replan output) into **N self-contained, independently implementable sub-plans**, each with explicit programmatic acceptance criteria, plus a **unified acceptance document** that ties them all together.

## Inputs

- `@plan-file` — path to the iplan/replan plan document to split
- `N` — number of sub-plans (optional; if omitted, infer from natural phase boundaries)

## Critical Principles

<HARD-GATE>
1. **Self-contained over DRY.** Each sub-plan MUST be implementable by an agent with zero knowledge of other sub-plans. Repeat context, type signatures, and background freely. Never write "see Part N" as a substitute for fully stating what is needed.
2. **No mid-step external dependencies.** A sub-plan must be fully completable before the next one begins. A sub-plan cannot require another sub-plan to be partially done.
3. **Programmatic acceptance only.** Every acceptance criterion must be an executable command with a defined expected output. "Looks correct", "as expected", or "no errors" without a command are not acceptance criteria.
4. **Interface contracts are first-class citizens.** Types, functions, and files that cross sub-plan boundaries must be declared explicitly in the producing sub-plan's **Deliverables** and in the consuming sub-plan's **Preconditions** — with exact signatures, file paths, and verification commands.
</HARD-GATE>

## Process

### Phase 1: Read & Inventory

1. Read the **entire** plan document. Do not skim.
2. List every phase and every step (e.g., "Phase 1 / Step 1.1", "Phase 2 / Step 2.3").
3. For each step note:
   - **Produces**: files created, types exported, schema changes, constants added
   - **Consumes**: what must already exist from prior steps
4. Write this as an explicit **Dependency Table** (see format below) before making any split decisions.

**Dependency Table format:**

| Step | Produces                                       | Consumes from              |
| ---- | ---------------------------------------------- | -------------------------- |
| 1.1  | `RecallChannelValues` in `shared/recall.ts`    | —                          |
| 1.2  | corrected channel labels in domain query       | 1.1 (`RecallChannel` type) |
| 2.1  | `RecallCandidate` type in `precision/types.ts` | 1.1 (`RecallChannel`)      |
| ...  | ...                                            | ...                        |

### Phase 2: Find Split Points

Given N sub-plans, find N−1 split points. A **valid split point** between step A and step B satisfies:

- All steps up to and including A are fully independent of steps from B onward.
- The set of artifacts produced by steps ≤ A that are consumed by steps ≥ B can be completely and explicitly described as an interface contract.
- The sub-plan containing steps ≤ A produces working, testable software on its own (a build/lint/test pass is achievable without steps ≥ B).

**Invalid split**: a step in the second half imports a type that the first half only half-defines, or a test in the second half cannot run without a runtime artifact from the first half that isn't yet stable.

If N cannot be satisfied without invalid splits, **reduce N and explain why**. Always prefer correctness over meeting the requested count.

Prefer split points at **natural phase boundaries** where a complete, independently testable subsystem exists.

### Phase 3: Extract Interface Contracts

For each split point, define the **interface contract** — all artifacts that cross the boundary:

- File paths and whether they are new or modified
- TypeScript types / Zod schemas with exact signatures (copy from original plan)
- Exported function signatures
- Database schema changes (table, column, index names)
- Constants or enum values

These contracts become:

- **Deliverables** section in the upstream (producing) sub-plan
- **Preconditions** section in the downstream (consuming) sub-plan

### Phase 4: Write Sub-Plans

Write each sub-plan as a separate file using the **chunked writing protocol** (rule: `chunked-writing.md`). File naming:

```
PLAN-<original-basename>-part<N>of<M>.md
```

in the same directory as the original plan.

Each sub-plan follows the template in **Sub-Plan Document Structure** below.

### Phase 5: Write Unified Acceptance Document

Write `PLAN-<original-basename>-unified-acceptance.md` in the same directory. This document:

- Lists all sub-plans in execution order with their acceptance criteria summarized
- Declares every spec requirement and maps it to the sub-plan + step that closes it
- Defines the final end-to-end integration gate (full workspace QA via qa-check)
- Serves as the single source of truth for "is this feature complete?"

### Phase 6: Self-Containedness Audit

After generating all sub-plans, verify each one against this checklist. **Do not skip — treat failures as blockers.**

For each sub-plan:

- [ ] No step references another sub-plan for implementation details (cross-references for context are OK, but never for required details)
- [ ] Every type used is either defined in the sub-plan body OR listed in Preconditions with an exact signature
- [ ] Every file path modified in a step either (a) already exists in the codebase or (b) is created by an earlier step in the same sub-plan
- [ ] Acceptance criteria are executable without running any step from another sub-plan
- [ ] No acceptance criterion contains the words "correct", "works", "expected", or "as intended" without naming the exact command and expected output string
- [ ] The Preconditions section contains a verification command that confirms all preconditions are met before implementation starts

Fix any violations before writing the output files.

---

## Sub-Plan Document Structure

````markdown
# [Feature Name] — Part N/M: [Phase Name]

**Parent plan:** @path/to/original-plan.md
**Part:** N of M
**Execution order:** Implement after Part N−1 is fully accepted (or: "no prerequisites" if Part 1)

**Goal:** [One sentence — what testable subsystem does this part deliver?]

---

## Preconditions

> Everything in this table must be satisfied before starting. Verify with the command below.

| What                 | File                                   | Verified by         |
| -------------------- | -------------------------------------- | ------------------- |
| `RecallChannel` type | `packages/shared/src/schema/recall.ts` | `pnpm tsc --noEmit` |
| ...                  | ...                                    | ...                 |

**Precondition check:**

```bash
# Run this first. If it fails, complete Part N−1 before continuing.
bash ./.claude/skills/qa-check/scripts/qa-run.sh \
  "Preconditions for Part N" \
  moon run shared:typecheck domain:typecheck --quiet
```

---

## Background & Goals

[Copy the relevant section from the parent plan. Include enough architecture context that this sub-plan is understandable without reading the original. Trim to scope — omit phases not covered here.]

---

## Architecture (scoped to this part)

[Mermaid diagram or component table scoped to components implemented in this part]

---

## Implementation Steps

[All steps relevant to this sub-plan, copied from the original plan with full detail: file paths, line numbers, code snippets, per-step verification commands. Nothing abridged.]

---

## Deliverables

> Interface contracts this sub-plan exports for downstream sub-plans. These MUST be satisfied for the next sub-plan's Preconditions to pass.

| What                   | File                                         | Signature / Value                             |
| ---------------------- | -------------------------------------------- | --------------------------------------------- |
| `RecallCandidate` type | `packages/operations/src/precision/types.ts` | `{ id: string; channel: RecallChannel; ... }` |
| ...                    | ...                                          | ...                                           |

---

## Programmatic Acceptance Criteria

> Closes spec requirements: [list requirement IDs or section names from the original spec]

Run all checks in order. Every check must pass before this part is considered accepted.

### 1. Type Safety

```bash
bash ./.claude/skills/qa-check/scripts/qa-run.sh \
  "Part N — typecheck" \
  moon ci :typecheck --quiet
```

Expected: exit 0, no TypeScript errors.

### 2. Unit Tests

```bash
bash ./.claude/skills/qa-check/scripts/qa-run.sh \
  "Part N — unit tests" \
  moon ci :test --quiet
```

Expected: exit 0, all test suites pass with 0 failures.

### 3. Lint & Format

```bash
bash ./.claude/skills/qa-check/scripts/qa-run.sh \
  "Part N — lint + fmt" \
  moon ci :lint :fmt --quiet
```

Expected: exit 0.

### 4. Deliverables Verification

Confirm the interface contracts declared in Deliverables are present and correctly typed:

| Deliverable                | Verification command                                                           | Expected output |
| -------------------------- | ------------------------------------------------------------------------------ | --------------- |
| `RecallCandidate` exported | `grep -r "export.*RecallCandidate" packages/operations/src/precision/types.ts` | non-empty match |
| ...                        | ...                                                                            | ...             |

### 5. Behavioral Checks (if applicable)

[Any additional CLI invocations, HTTP requests, database queries, or generated-file diffs required to prove the implementation is correct. Use `pnpm cat-cli` for API endpoint tests where applicable.]

---

## Acceptance Gate

```bash
# Run after all steps above are complete
bash ./.claude/skills/qa-check/scripts/qa-run.sh \
  "Part N — full acceptance" \
  moon ci :test :lint :typecheck :fmt --quiet
```

**Pass signal:** Exit 0 with no failures printed.
````

---

## Unified Acceptance Document Structure

````markdown
# [Feature Name] — Unified Acceptance

**Parent plan:** @path/to/original-plan.md
**Parts covered:** N (Part 1 through Part N)

---

## Execution Order

Implement and accept each part fully before starting the next.

| Part | Title        | Prerequisite    | Accepted |
| ---- | ------------ | --------------- | -------- |
| 1    | [Phase Name] | —               | [ ]      |
| 2    | [Phase Name] | Part 1 accepted | [ ]      |
| 3    | [Phase Name] | Part 2 accepted | [ ]      |

---

## Per-Part Acceptance Summary

### Part 1 — [Phase Name]

Acceptance command:

```bash
bash ./.claude/skills/qa-check/scripts/qa-run.sh \
  "Part 1 acceptance" \
  moon ci :test :lint :typecheck :fmt --quiet
```

Pass signal: exit 0.

Spec requirements closed: [list]

[Repeat for each part]

---

## Requirements Traceability

Every spec requirement must appear here exactly once.

| Requirement                                             | Spec section        | Closed by        | Verification command                                         |
| ------------------------------------------------------- | ------------------- | ---------------- | ------------------------------------------------------------ |
| Top-1 wrong candidates reduced in short-query scenarios | §Success Criteria 1 | Part 4, Step 4.3 | `pnpm vitest run --project unit-operations -t "short-query"` |
| ...                                                     | ...                 | ...              | ...                                                          |

---

## Final Integration Gate

Run after ALL parts are accepted. This is the authoritative pass/fail signal for the entire feature.

```bash
bash ./.claude/skills/qa-check/scripts/qa-run.sh \
  "Full workspace QA — [Feature Name]" \
  moon exec :test :lint :typecheck :fmt --on-failure continue --upstream deep --quiet
```

**Pass signal:** Exit 0, no failing tasks.

After local QA passes, verify CI:

```bash
gh run list --limit 1 --json databaseId,status,conclusion,name
gh run watch <run-id> --exit-status
```
````

---

## Guidance for Borderline Split Points

**When a phase produces types used immediately in the next phase:** Move the type definitions to the first sub-plan. The second sub-plan lists those types in Preconditions. This is the most common pattern.

**When two phases share a test fixture:** Include the fixture definition in the sub-plan that first introduces it. In the second sub-plan's Preconditions, list the fixture file as a required artifact.

**When a refactor in one step changes call sites spread across phases:** Either keep the refactor and all its call-site fixes in a single sub-plan, or use a backward-compatible intermediate form as the split point.

**When the original plan has no natural phase boundary near the requested N:** Inform the user and suggest the nearest valid N instead. Do not force an invalid split.

## QA Reference

All acceptance commands use the qa-check skill scripts from `.claude/skills/qa-check/scripts/qa-run.sh`. See [qa-check SKILL.md](./../qa-check/SKILL.md) for the output policy: on success print only a short report; on failure print the full log.
