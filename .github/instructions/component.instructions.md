---
description: Component reuse and discovery guidelines for Vue component development.
applyTo: "apps/app/**/*.{vue,ts}"
---

# Vue Component Reuse Guidelines

## 1. Mandatory Component Discovery

- **Search First:** Before implementing any custom UI element from scratch, you **must** thoroughly search the `apps/app-ui/src` and `apps/app/src/app/components` directories to check if a suitable component already exists.
- **Avoid Duplication:** Do not reinvent standard UI patterns (e.g., buttons, modals, dialogs, pagination, data tables). Always prioritize reusing the established design system components.

## 2. Import Conventions

- **Standard Paths:** Import existing components directly from the designated directory using your project's configured alias (e.g., `@/app/components/` or relative paths depending on your setup).

## 3. Extending Existing Components

- **Slot Composition:** Leverage Vue slots (`<slot>`) provided by existing layout or wrapper components to inject custom content, rather than rebuilding the structural container.

## 4. Avoiding Direct Modifications to Shared Components

- **Wrapper Pattern First:** When you need to customize a shared component (especially shadcn-vue components in `apps/app-ui/src`), **always prefer creating a wrapper component** rather than modifying the source file directly.

**Example - Preferred (Wrapper):**

```vue
<!-- apps/app/src/app/components/CustomButton.vue -->
<script setup lang="ts">
import { Button } from "@cat/app-ui";
import type { ButtonVariants } from "@cat/app-ui";

const props = defineProps<{
  variant?: ButtonVariants["variant"];
  customFeature?: string;
}>();
</script>

<template>
  <Button :variant="variant" v-bind="$attrs">
    <slot />
    <span v-if="customFeature">{{ customFeature }}</span>
  </Button>
</template>
```

**Example - Avoid (Direct Modification):**

```vue
<!-- ❌ Don't modify apps/app-ui/src/components/button/Button.vue directly -->
```

- **When Source Modification is Absolutely Necessary:** Only modify source files when:
  - The change is a bug fix that should be upstreamed
  - The customization is too complex for a wrapper pattern
  - Performance considerations require direct modification
- **Mandatory Annotation:** When you must modify a source file, add the appropriate annotation at the top:

**For components that should not be auto-synced:**

```typescript
/**
 * @shadcn-do-not-sync
 * reason: [Brief explanation, e.g., custom virtual scrolling support]
 * lastReviewed: YYYY-MM-DD
 */
```

**For custom component files (not in upstream):**

```vue
<!--
  @shadcn-custom-component
  description: [Description, e.g., Separate viewport for custom scrolling]
  lastReviewed: YYYY-MM-DD
-->
```

- **Sync Awareness:** Remember that components in `apps/app-ui/src/` are managed by the shadcn-vue sync system. Direct modifications will be overwritten during sync unless properly annotated.

## 5. Scripting & Type Rigor (When Writing Wrapper/Glue Code)

- **Arrow Functions Only:** All methods, event handlers, and callbacks within `<script setup>` must be defined using arrow functions. Do not use `function` declarations or expressions.
- **Strict Typing (No `any`):** Explicitly define types for all props, emits, and reactive state. The `any` keyword is strictly prohibited. Use generic objects (e.g., `Record<string, unknown>`) or define specific interfaces if the exact shape is temporarily unknown.

## 6. Fallback for Missing Components

- **Justification Required:** If you determine that a new component must be created because nothing suitable exists in `apps/app/src/app/components` and `apps/app-ui/src`, ensure the new component is modular and placed in the `apps/app/src/app/components` if it has the potential for future reuse.
