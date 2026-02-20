---
description: Project context and coding guidelines for AI to follow when generating code or answering questions.
applyTo: "**/*.{ts,tsx,js,jsx,vue}"
---

# Project Coding Guidelines

## 1. TypeScript & JavaScript Style Requirements

### Function Syntax Preference

- **Arrow Functions Only:** **Never** generate `function` declarations or expressions. Always default to arrow functions.
- **Exceptions:** If you firmly believe `function` is strictly required (e.g., for generator functions or specific `this` binding contexts):
  1.  Stop and re-evaluate the design.
  2.  Attempt a structural rewrite using arrow functions.
  3.  Only proceed with `function` if JavaScript/TypeScript semantics make arrow functions impossible.
  4.  **Mandatory:** You must annotate the reason explicitly in a comment alongside the generated `function`.

### Type Safety Restrictions

- **No Explicit `any`:** **Never** use the explicit `any` type or unsafe type assertions (e.g., `as any`, `as unknown as T`). Strict type safety is mandatory.
- **Exceptions:** If you believe `any` or an unsafe cast is unavoidable:
  1.  Stop and re-evaluate the type definitions.
  2.  Attempt to use `unknown`, generics, or proper type narrowing/guards.
  3.  Only proceed if external library types are inherently broken or strictly demand it.
  4.  **Mandatory:** You must annotate the reason explicitly in a comment explaining why a safe type cannot be used.

## 2. Code Generation Rules

- **Provide Complete Code:** Unless explicitly instructed otherwise, or if the change is extremely small and its exact insertion point is immediately obvious to seamlessly patch into the old code, **always return the complete file code** rather than partial snippets.
