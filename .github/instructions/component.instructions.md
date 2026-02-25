---
description: Component reuse and discovery guidelines for Vue component development.
applyTo: "apps/app/**/*.vue"
---

# Vue Component Reuse Guidelines

## 1. Mandatory Component Discovery

- **Search First:** Before implementing any custom UI element from scratch, you **must** thoroughly search the `apps/app/src/app/components` directory to check if a suitable component already exists.
- **Avoid Duplication:** Do not reinvent standard UI patterns (e.g., buttons, modals, dialogs, pagination, data tables). Always prioritize reusing the established design system components.

## 2. Import Conventions

- **Standard Paths:** Import existing components directly from the designated directory using your project's configured alias (e.g., `@/app/components/` or relative paths depending on your setup).

## 3. Extending Existing Components

- **Props Over Duplication:** If an existing component in `apps/app/src/app/components` closely matches your requirements but lacks a specific feature, prefer extending it by adding optional props or slots rather than duplicating the file or building a new one.
- **Slot Composition:** Leverage Vue slots (`<slot>`) provided by existing layout or wrapper components to inject custom content, rather than rebuilding the structural container.

## 4. Scripting & Type Rigor (When Writing Wrapper/Glue Code)

- **Arrow Functions Only:** All methods, event handlers, and callbacks within `<script setup>` must be defined using arrow functions. Do not use `function` declarations or expressions.
- **Strict Typing (No `any`):** Explicitly define types for all props, emits, and reactive state. The `any` keyword is strictly prohibited. Use generic objects (e.g., `Record<string, unknown>`) or define specific interfaces if the exact shape is temporarily unknown.

## 5. Fallback for Missing Components

- **Justification Required:** If you determine that a new component must be created because nothing suitable exists in `apps/app/src/app/components`, ensure the new component is modular and placed in the appropriate shared directory if it has the potential for future reuse.

```

```
