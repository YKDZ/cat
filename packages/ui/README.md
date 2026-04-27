# @cat/ui

Shadcn-Vue based UI component library for Cat project.

## Overview

This package contains all shadcn-vue components and utilities used across the Cat application. It provides a centralized, maintainable UI system with automated sync capabilities.

## Features

- 🎨 **Shadcn-Vue Components**: Full collection of beautifully designed components
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
