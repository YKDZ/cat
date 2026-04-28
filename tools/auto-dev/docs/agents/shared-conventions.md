# Shared Agent Conventions

## Decision Tool Call Format

```bash
auto-dev request-decision \
  --workflow-run-id <id> \
  --title "Decision title" \
  --options '[{"key":"a","label":"Option A","description":"..."}]' \
  --recommendation "a" \
  --context "Additional context"
```

## remainingDecisions Monitoring

- Always check `remainingDecisions` in the response
- Use `auto-dev status` to check current state
- Use `auto-dev decisions` to see pending decisions

## Phase Reporting

```bash
auto-dev report-phase --run-id <id> --phase <phase> [--summary "text"]
```

## Summary Publishing

```bash
auto-dev publish-summary --run-id <id> --summary "What was accomplished"
```
