---
description: Project context and coding guidelines for AI to follow when reviewing changes.
applyTo: "**/*"
---

# Post-Modification Review (Nx Tasks)

- **Mandatory QA Check:** After generating or modifying any code, you must validate the changes in the modified sub-projects using the project-defined `nx` tasks.
- **Execution:** Run test, linting, typechecking, and formatting for the affected sub-projects.

## Commands

**For affected projects:**

```bash
script -q -c "pnpm nx affected --target=test,lint,typecheck,fmt" /dev/null 2>&1 | sed 's/\x1b\[[0-9;]*m//g; s/\x1b\[?25[hl]//g; s/\[1G//g; s/\[0K//g; s/\[0J//g; s/\[[0-9]*A//g' | tr -d '\r\033' | grep -E "Successfully ran|Failed to run" | tail -1
```

**For all projects:**

```bash
script -q -c "pnpm nx run-many --target=test,lint,typecheck,fmt --all" /dev/null 2>&1 | sed 's/\x1b\[[0-9;]*m//g; s/\x1b\[?25[hl]//g; s/\[1G//g; s/\[0K//g; s/\[0J//g; s/\[[0-9]*A//g' | tr -d '\r\033' | grep -E "Successfully ran|Failed to run" | tail -1
```

**Retry specific projects:**

```bash
pnpm nx run-many --target=test,lint,typecheck,fmt --projects=<project1>,<project2>
```

## Error Handling

- **On failure:** Re-run without filtering to see full error output and identify failed projects.
- Fix the issues and retry the specific projects using `--projects` parameter.
- Example: `pnpm nx run-many --target=test,lint,typecheck,fmt --projects=@cat/shared,@cat/ui`
