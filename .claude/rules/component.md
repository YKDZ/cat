---
description: Component reuse and discovery guidelines for Vue component development.
paths: ["**/*.{vue,ts}"]
---

# Vue 组件复用规范

## 正面限制

1. **先搜再写。** 在实现任何新 UI 之前，先检查 `packages/ui/src/components` 和 `apps/app/src/app/components` 是否已经有可复用组件。
2. **优先复用共享组件。** 按钮、对话框、表单项、分页、数据表格等常见模式，应优先基于 `@cat/ui` 或现有 app 组件组合，而不是重新实现。
3. **优先组合，不要复制。** 需要定制行为时，优先用 wrapper、slot、props 或组合式封装扩展已有组件。
4. **新组件放对位置。**
   - 设计系统级、跨应用复用：放在 `packages/ui/src/components/**`
   - 仅 app 内复用：放在 `apps/app/src/app/components/**`
5. **通用函数风格与类型约束遵循全局规则。** Vue 组件里的函数写法和类型安全要求统一遵循 `type-safety.md`，这里不再重复定义同义规则。

## 负面限制

1. **不要重复实现已有共享 UI。** 只因为“自己写更快”而绕过现有组件，会把设计系统撕成碎片。
2. **不要直接修改共享组件源码，除非确有必要。** 只有满足以下任一条件时，才考虑直接改 `packages/ui/src/components/**`：
   - 这是应保留到共享层的 bug fix
   - wrapper / slot 无法表达该定制
   - 性能或 DOM 结构限制要求直接修改源码
3. **不要绕过 shadcn 同步机制。** `packages/ui/src/components/**` 中很多组件受同步脚本管理；直接改源码且不加标注，后续同步时很容易被覆盖。

## 例子

### 推荐：用 wrapper 扩展共享组件

```vue
<!-- apps/app/src/app/components/CustomButton.vue -->
<script setup lang="ts">
import { Button } from "@cat/ui";
import type { ButtonVariants } from "@cat/ui";

const props = defineProps<{
  variant?: ButtonVariants["variant"];
  customFeature?: string;
}>();
</script>

<template>
  <Button :variant="props.variant" v-bind="$attrs">
    <slot />
    <span v-if="props.customFeature">{{ props.customFeature }}</span>
  </Button>
</template>
```

### 避免：为了页面局部需求直接改共享组件

```vue
<!-- ❌ 不要为了单个页面需求直接改 packages/ui/src/components/button/Button.vue -->
```

### 必须直接修改共享组件时，补齐同步标注

```ts
/**
 * @shadcn-do-not-sync
 * reason: custom virtual scrolling support
 * lastReviewed: YYYY-MM-DD
 */
```

```vue
<!--
  @shadcn-custom-component
  description: Separate viewport for custom scrolling
  lastReviewed: YYYY-MM-DD
-->
```
