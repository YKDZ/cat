---
description: Project context and coding guidelines for AI to follow when reviewing changes.
applyTo: '**/*
---

# Post-Modification Review (Nx Tasks)

- **Mandatory QA Check:** After generating or modifying any code, you must validate the changes in the modified sub-projects using the project-defined `nx` tasks.
- **Execution:** To simplify the process, use the `run-many` command to run test, linting, typechecking, and formatting sequentially for the affected sub-projects.
- **Command Syntax:** Execute `nx run-many --target=test,lint,typecheck,format --projects=<project-name1>,<project-name2>` to ensure code style compliance, strict type safety, and consistent formatting.
