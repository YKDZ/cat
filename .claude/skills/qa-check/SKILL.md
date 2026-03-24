---
name: qa-check
description: Run mandatory QA checks. Use this skill after generating or modifying any code to execute tests, linting, typechecking, and formatting on the modified sub-projects.
---

# Post-Modification Progressive Review (Nx Tasks)

You must validate the changes progressively to ensure both local and workspace-wide integrity. Please strictly follow these steps sequentially:

## 1. Identify Changes and Affected Projects

Review the following list of recently modified files and analyze which Nx sub-projects they belong to:

- Workspace changes: !`git diff --name-only`
- Staged changes: !`git diff --cached --name-only`

## 2. Phase 1: Targeted QA Check (Modified Projects)

First, validate only the projects you just modified (affected). Construct and execute the following command using the Bash tool. This command saves the full output to a log file and only displays the last 30 lines so you can quickly check for the "Successfully ran targets" message:

```bash
pnpm nx affected --target=test,lint,typecheck,fmt --output-style=dynamic-legacy 2>&1 | tail -n 6
```

_Note: If Phase 1 fails (the tail output shows failed tasks instead of success), immediately proceed to Step 4 (Validation and Remediation) and fix the issues before moving to Phase 2._

## 3. Phase 2: Full Workspace QA Check

Once the targeted projects pass Phase 1 successfully, you must ensure your changes did not break other dependent projects. Run the complete QA suite across the entire workspace, using the same log-and-tail strategy:

```bash
pnpm nx run-many --target=test,lint,typecheck,fmt --all --output-style=dynamic-legacy 2>&1 | tail -n 6
```

## 4. Validation and Remediation (Error Handling)

- You must ensure code style compliance, strict type safety, and consistent formatting.
- **CRITICAL Log Reading Strategy:** If the `tail -n 30` output from Phase 1 or Phase 2 indicates that tasks failed, **DO NOT** re-run the command without output redirection. Instead, you must query the log using `grep` to find the specific errors.
- Execute a command like this to isolate the failures:
  ```bash
  grep -iE -B 2 -A 10 "error|fail|warn" nx-phase1.log
  ```
- Proactively analyze these isolated error causes and use tools to fix the code.
- Once fixed, you must **re-run** the specific Phase 1 or Phase 2 command (including the `> log 2>&1; tail` part) and repeat this process until the tail output confirms all checks pass completely.
