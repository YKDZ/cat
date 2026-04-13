---
name: moon-task-runner
description: Run one-off or multi-target moon tasks with low-noise output. Use when an agent needs to execute `moon exec`, `moon run`, `moon ci`, or `moon check` for standalone validation, focused testing, or multi-task QA, and decide directly whether to use `--quiet`, `--summary minimal`, or `MOON_OUTPUT_STYLE=buffer-only-failure`.
user-invocable: false
---

# Low-noise Moon Task Execution

Use moon's exec-based commands to run targeted validation without flooding chat with decorative moon output.
Do not rely on a wrapper script for this skill. Build the appropriate `moon` command directly based on the task, desired verbosity, and whether you need pass/fail-focused output.

## When to Use

- Run a single known task, such as `root:lint` or `app:typecheck`
- Run multiple explicit tasks in one command for focused validation
- Run affected tasks in CI mode without switching to a full QA workflow
- Re-run a smaller subset of tasks after fixing a failure
- Execute moon commands autonomously while keeping user-facing output small

## Command Selection

- `moon exec` — Default choice for ad hoc execution. Best when you need one or many explicit targets, `--query`, `--affected`, or `--on-failure continue`.
- `moon run` — Use for a known target list when normal fail-fast behavior is preferred.
- `moon ci` — Use for affected-by-changed-files runs with CI defaults.
- `moon check` — Use when validating the standard build/test tasks of a project.

## Output Guidance

- Run commands from the repository root and prefer the `moon` binary directly instead of `pnpm moon`, especially in nested or multi-repo workspaces.
- Prefer `--quiet` for agent-driven runs when you want to hide non-important moon UI while still keeping task warnings and errors visible.
- Prefer `MOON_OUTPUT_STYLE=buffer-only-failure` when you want passing task output suppressed but still want failing task logs.
- Do not add noisy flags like `--log trace` unless you are explicitly debugging moon itself.
- Only add `--summary minimal` when a brief human-readable summary is genuinely useful.
- Keep target scope narrow. Prefer `root:lint` over a workspace-wide `:lint` when the smaller command is enough.
- If you need success-silent / failure-full QA semantics, use the `qa-check` skill instead of reimplementing log capture here.

## Direct Invocation Heuristics

Assemble the command yourself based on the situation:

- **Default low-noise validation**: use `--quiet` and `MOON_OUTPUT_STYLE=buffer-only-failure`.
- **Need a short end-of-run summary**: add `--summary minimal`.
- **Need full streaming output for debugging or user-requested visibility**: omit `--quiet` and, if needed, set `MOON_OUTPUT_STYLE=stream`.
- **Need fail-fast behavior**: prefer `moon run`.
- **Need affected CI defaults**: prefer `moon ci`.
- **Need broad orchestration knobs like `--query`, `--affected`, or `--on-failure continue`**: prefer `moon exec`.
- **Need the standard build/test bundle for a project**: prefer `moon check`.

## Workflow

1. Pick the smallest suitable moon subcommand.
2. Decide the output mode before running it:
   - low-noise validation → `MOON_OUTPUT_STYLE=buffer-only-failure` + `--quiet`
   - human-readable summary → optionally add `--summary minimal`
   - full debug visibility → omit `--quiet` and consider `MOON_OUTPUT_STYLE=stream`

3. Run the command directly from the repository root. For example:

   ```bash
   cd /workspaces/cat
   MOON_OUTPUT_STYLE=buffer-only-failure moon exec root:lint --quiet
   ```

4. For multi-task validation, pass multiple explicit targets:

   ```bash
   cd /workspaces/cat
   MOON_OUTPUT_STYLE=buffer-only-failure moon exec root:lint root:typecheck --quiet
   ```

5. For affected CI-style runs:

   ```bash
   cd /workspaces/cat
   MOON_OUTPUT_STYLE=buffer-only-failure moon ci :test :lint --quiet
   ```

6. If you need moon's normal UI, run directly without `--quiet`:

   ```bash
   cd /workspaces/cat
   moon exec root:lint --summary minimal
   ```

7. If you need successful task output to stream normally, override the output style explicitly:

   ```bash
   cd /workspaces/cat
   MOON_OUTPUT_STYLE=stream moon exec app:build --summary minimal
   ```

## Notes

- This skill standardizes `exec`, `run`, `ci`, and `check`, but the agent should choose which one fits the situation best.
- If passthrough args are needed, append them after `--` just like a normal `moon` command.
- The important part is the decision policy, not a wrapper: choose the right moon subcommand, choose the right verbosity, and run it directly.
