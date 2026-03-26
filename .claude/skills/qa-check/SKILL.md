---
name: qa-check
description: Run mandatory QA checks. Use this skill after generating or modifying any code to execute tests, linting, typechecking, and formatting on the modified sub-projects.
user-invocable: false
---

# Post-Modification Progressive Review (Nx Tasks)

You must validate the changes progressively to ensure both local and workspace-wide integrity. Please strictly follow these steps sequentially:

## 1. Identify Changes and Affected Projects

Review the following list of recently modified files and analyze which Nx sub-projects they belong to:

- Workspace changes: !`git diff --name-only`
- Staged changes: !`git diff --cached --name-only`

## 2. Phase 1: Targeted QA Check (Modified Projects)

First, validate only the projects you just modified (affected):

```bash
script -q -c "pnpm nx affected --target=test,lint,typecheck,fmt" /dev/null 2>&1 | sed 's/\x1b\[[0-9;]*m//g; s/\x1b\[?25[hl]//g; s/\[1G//g; s/\[0K//g; s/\[0J//g; s/\[[0-9]*A//g' | tr -d '\r\033' | grep -E "Successfully ran|Failed to run" | tail -1
```

_Note: If Phase 1 shows "Failed to run", immediately proceed to Step 4 (Validation and Remediation) and fix the issues before moving to Phase 2._

## 3. Phase 2: Full Workspace QA Check

Once the targeted projects pass Phase 1 successfully, ensure your changes did not break other dependent projects:

```bash
script -q -c "pnpm nx run-many --target=test,lint,typecheck,fmt --all" /dev/null 2>&1 | sed 's/\x1b\[[0-9;]*m//g; s/\x1b\[?25[hl]//g; s/\[1G//g; s/\[0K//g; s/\[0J//g; s/\[[0-9]*A//g' | tr -d '\r\033' | grep -E "Successfully ran|Failed to run" | tail -1
```

## 4. Validation and Remediation (Error Handling)

- You must ensure code style compliance, strict type safety, and consistent formatting.
- **CRITICAL:** If Phase 1 or Phase 2 shows failure, re-run without filtering to see the full error output:
  ```bash
  pnpm nx affected --target=test,lint,typecheck,fmt
  ```
  or for full workspace:
  ```bash
  pnpm nx run-many --target=test,lint,typecheck,fmt --all
  ```
- Analyze the error messages and identify failed projects.
- **Retry specific projects** using the `--projects` parameter:
  ```bash
  pnpm nx run-many --target=test,lint,typecheck,fmt --projects=<project1>,<project2>
  ```
  Example:
  ```bash
  pnpm nx run-many --target=test,lint,typecheck,fmt --projects=@cat/shared,@cat/ui
  ```
- Proactively analyze the error messages and use tools to fix the code.
- Once fixed, re-run the appropriate Phase command and repeat this process until it shows "Successfully ran".
