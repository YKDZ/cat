---
name: Shadcn-Vue Component Sync
description: Automated issue for shadcn-vue component updates
title: "🔄 Shadcn-Vue Components Update Available"
labels: [dependencies, shadcn-vue, automated]
---

## Component Sync Check Failed

The automated check has detected that some shadcn-vue components can be synced with the upstream registry.

## Action Required

Please run the following command locally to sync the components:

```bash
node apps/app/scripts/sync-shadcn-components.js
```

Then verify the changes:

```bash
pnpm exec nx run-many --target=lint,typecheck --projects=@cat/app
```

## Components to Sync

The sync script will automatically:
- ✅ Sync components that are up to date with upstream
- ⚠️ Skip components marked with `@shadcn-do-not-sync`
- ⚠️ Skip components that have been abandoned by upstream

## Verification Checklist

- [ ] Components synced successfully
- [ ] Lint passed
- [ ] Typecheck passed
- [ ] Manual testing completed (if needed)
- [ ] Commit and push changes

---

**Detected by**: [sync-shadcn-components.js](/apps/app/scripts/sync-shadcn-components.js)  
**Workflow**: [Sync Shadcn-Vue Components](/.github/workflows/sync-shadcn-components.yml)
**Date**: ${date}
