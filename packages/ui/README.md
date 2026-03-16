# @cat/ui

Shadcn-Vue based UI component library for Cat project.

## Overview

This package contains all shadcn-vue components and utilities used across the Cat application. It provides a centralized, maintainable UI system with automated sync capabilities.

## Features

- 🎨 **Shadcn-Vue Components**: Full collection of beautifully designed components
- 🔄 **Automated Sync**: Monthly sync with upstream shadcn-vue registry
- 📦 **Tree-shakable**: ES modules with proper exports
- 🎯 **Type-safe**: Full TypeScript support
- 🚀 **Modern**: Built with Vite, Vue 3, and Reka UI

## Installation

```bash
pnpm add @cat/ui
```

## Usage

```typescript
import { Button, Card } from "@cat/ui";
```

## Component Sync

This library automatically syncs with the upstream shadcn-vue registry while preserving custom enhancements.

### Sync Commands

```bash
# Sync all components
pnpm sync

# Check sync status (CI/CD mode)
pnpm sync:check

# Preview sync (dry run)
node scripts/sync-shadcn-components.js --dry-run
```

### Annotation System

Components can be marked to prevent auto-sync:

```typescript
/**
 * @shadcn-do-not-sync
 * reason: Custom virtual scrolling support
 * lastReviewed: 2026-02-25
 */
```

Custom component files:

```vue
<!--
@shadcn-custom-component
description: Separate viewport for custom scrolling
lastReviewed: 2026-02-25
-->
```

## Structure

```
src/
├── components/
│   └── ui/          # Shadcn-vue components
├── utils/
│   └── lib/         # Utilities (cn, etc.)
├── composables/     # Vue composables (future)
├── styles/          # Global styles (future)
└── index.ts         # Main entry point
```

## Development

```bash
# Install dependencies
pnpm install

# Build library
pnpm build

# Watch mode
pnpm dev

# Lint
pnpm lint

# Format
pnpm format

# Type check
pnpm typecheck
```

## Current Status

- **Total Components**: 34
- **Synced with Upstream**: 28 (82%)
- **Custom (Do Not Sync)**: 6 (18%)
  - combobox
  - dropdown-menu
  - form
  - navigation-menu
  - pagination
  - sidebar

**Custom Files**: 8

- combobox/ComboboxViewport.vue
- combobox/ComboboxItemIndicator.vue
- card/CardAction.vue
- dialog/DialogOverlay.vue
- popover/PopoverAnchor.vue
- resizable/ResizablePanel.vue
- sheet/SheetOverlay.vue
- table/utils.ts

## License

GPL-3.0-only
