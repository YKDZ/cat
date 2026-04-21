---
name: qa-check
description: Run mandatory moon-based QA checks after modifying code. Use affected checks first, print only a short success report when checks pass, and print full logs when checks fail.
user-invocable: false
---

# Post-Modification QA Review (moon)

Use moon's built-in affected and CI semantics instead of manually mapping `git diff` output to projects.

- `moon ci` already determines changed files, computes affected tasks, continues through failures, and summarizes the run.
- `moon exec` is the low-level escape hatch for full-workspace sweeps that need explicit failure behavior.
- `MOON_OUTPUT_STYLE=buffer-only-failure` is a global override for task output style, and is a much better default for agent-driven QA than raw streaming output.
- If you only need to inspect scope, use `moon query projects --affected`.

## Output policy

QA output must follow this rule:

- If a QA command succeeds, do **not** print its task output. Print a short success report instead.
- If a QA command fails, print the **entire** captured log.
- Do **not** use `script`, `sed`, `grep`, `tail`, or other truncation filters for QA commands.
- Do **not** re-run a failed command just to reveal the full error output; the first failing run must already show it.

Always use the bundled [QA helper script](./scripts/qa-run.sh) instead of defining a shell function inline.
Inline functions are scoped to the current shell session and are easy to lose between terminal commands; the bundled script is reusable across agents and runs.
The helper automatically defaults `MOON_OUTPUT_STYLE` to `buffer-only-failure`, so successful task output is suppressed natively before the helper decides whether to print the overall command log.

From the repository root, invoke it like this:

```bash
bash ./.claude/skills/qa-check/scripts/qa-run.sh "<label>" <command> [args...]
```

## 1. Phase 1: Affected QA

Start with moon's CI workflow. This is the default targeted check because it already uses changed files to determine the affected task set.

```bash
bash ./.claude/skills/qa-check/scripts/qa-run.sh \
  "Affected QA passed (moon ci :test :lint :typecheck :fmt)" \
  moon ci :test :lint :typecheck :fmt --quiet
```

If you need to inspect what moon considers affected before running QA, query it directly:

```bash
moon query projects --affected
```

## 2. Phase 2: Full workspace QA

After the affected check passes, run a workspace-wide sweep to catch broader regressions. Use `moon exec` here so failure handling is explicit and non-fail-fast.

```bash
bash ./.claude/skills/qa-check/scripts/qa-run.sh \
  "Workspace QA passed (moon exec :test :lint :typecheck :fmt)" \
  moon exec :test :lint :typecheck :fmt --on-failure continue --upstream deep --quiet
```

## 3. Failure remediation

If either phase fails:

- Start from the printed log. It is already the full failure output.
- Identify the failed projects and tasks, then fix them.
- Re-run the smallest relevant set of targets first. For example:

```bash
bash ./.claude/skills/qa-check/scripts/qa-run.sh \
  "shared/ui QA passed" \
  moon run \
    shared:test shared:lint shared:typecheck shared:fmt \
    ui:test ui:lint ui:typecheck ui:fmt \
    --quiet
```

- Once the targeted retry passes, re-run the failed phase.
- Repeat until both phases pass.

## 4. CI verification

After local QA passes, push the branch and verify the GitHub Actions CI workflow:

```bash
# Get the latest run after pushing
gh run list --limit 1 --json databaseId,status,conclusion,name

# Watch and wait for completion (exits non-zero on failure)
gh run watch <run-id> --exit-status
```

The CI workflow (`.github/workflows/ci.yml`) is the **authoritative acceptance gate**. It runs all local checks plus jobs that cannot be replicated locally:

| Job                   | Checks                                           |
| --------------------- | ------------------------------------------------ |
| **Static Gateway**    | codegen-check, fmt-check, typecheck, lint        |
| **Unit Tests**        | all unit test suites                             |
| **Integration Tests** | database integration tests                       |
| **E2E Tests**         | full Playwright suite against a live application |

CI is not optional. Passing local QA without verifying CI is insufficient — E2E tests in particular require a real database, Redis, and a built production server.

## 4. Guardrails

- Prefer `moon ci` over manual `git diff` inspection for affected QA.
- Prefer `moon exec` over `moon run` when you need explicit `--on-failure continue` behavior.
- Prefer the bundled `./.claude/skills/qa-check/scripts/qa-run.sh` helper over inline shell functions.
- Prefer the helper's default `MOON_OUTPUT_STYLE=buffer-only-failure` over ad hoc output filtering.
- Keep successful QA output tiny; keep failing QA output complete.
