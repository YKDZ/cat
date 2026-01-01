# TypeScript & JavaScript Style Guidelines

## Function Syntax Preference
**Never** generate `function` declarations or expressions.

If you believe `function` is required:
1. Stop and re-evaluate the design.
2. Attempt a structural rewrite using arrow functions.
3. Only proceed with `function` if JavaScript semantics (e.g., generator functions, `this` context binding in specific libraries) make arrow functions impossible.
4. In that case, **annotate the reason explicitly** in a comment.

**Assume arrow functions are always preferred unless proven impossible.**

## Type Safety Requirements
**Never** use the explicit `any` type or unsafe type assertions (e.g., `as any`, `as unknown as T`).

If you believe `any` or an unsafe cast is required:
1. Stop and re-evaluate the type definitions.
2. Attempt to use `unknown`, generics, or proper type narrowing/guards.
3. Only proceed if the external library types are broken or strictly require it.
4. In that case, **annotate the reason explicitly** in a comment explaining why a safe type cannot be used.

**Strict type safety is mandatory.**