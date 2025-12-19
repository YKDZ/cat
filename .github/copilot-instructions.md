Never generate `function` declarations or expressions.

If you believe `function` is required:

- Stop and re-evaluate the design.
- Attempt a structural rewrite using arrow functions.
- Only proceed with `function` if JavaScript semantics make arrow functions impossible.
- In that case, annotate the reason explicitly.

Assume arrow functions are always preferred unless proven impossible.
