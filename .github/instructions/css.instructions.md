---
description: Styling guidelines for Vue components emphasizing Tailwind CSS v4 utility-first approach.
applyTo: "**/*.{vue,css,scss,sass,less}"
---

# Vue Component Styling Guidelines (Tailwind CSS v4)

## 1. Utility-First Preference

- **Template-Driven Styling:** You **must** prioritize styling elements directly in the `<template>` using Tailwind CSS v4 utility classes.
- **Avoid Style Blocks:** Do not create a `<style>` block unless the styling requirements cannot be reasonably achieved using inline utility classes in the template.

## 2. Managing Vue-Specific Selectors

- **Scoped Styling for Internals:** When you need to style deeply nested child components or injected slot content using Vue's specific pseudo-classes (`:deep()`, `:slotted()`, `:global()`), you are permitted to use a `<style scoped>` block.

## 3. Use of `@apply` and Native CSS

- **Prefer Tailwind utilities in `<template>`.**
- **Scoped `<style>` blocks:** Use `@apply` for deep selectors only if your Tailwind config and main CSS do not break build (see below).
- **Compatibility warning:** If your main CSS (e.g. `tailwind.css`) contains `@apply` rules, using `@reference` in scoped styles may cause build errors (e.g. `Cannot apply unknown utility class 'border-border'`).
- **Fallback:** If `@apply` fails in scoped styles, use native CSS properties instead.

**Example:**

```vue
<template>
  <div class="p-4 bg-white rounded-xl shadow-md">
    <button class="px-4 py-2 text-white bg-blue-500 rounded hover:bg-blue-600">
      Toggle
    </button>
    <ChildComponent class="custom-wrapper" />
  </div>
</template>

<style scoped>
/* Prefer @apply, but use native CSS if build fails */
.custom-wrapper :deep(.child-inner-element) {
  /* @apply flex items-center justify-between p-2 mt-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors; */
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem;
  margin-top: 1rem;
  background-color: #f8fafc;
  border-radius: 0.5rem;
  transition: background-color 0.2s;
}
</style>
```

## 4. Exceptional Cases for Native CSS

- Use native CSS only for:
  - Complex custom animations
  - Dynamic `calc()` with injected variables
  - CSS features not supported by Tailwind
