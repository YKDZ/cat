---
description: Styling guidelines for Vue components emphasizing Tailwind CSS v4 utility-first approach.
paths: ["**/*.{vue,css,scss,sass,less}"]
---

# Vue 组件样式规范（Tailwind CSS v4）

## 正面限制

1. **优先使用 utility class。** 样式应尽量直接写在 `<template>` 中，优先使用 Tailwind CSS v4 提供的 utility classes。
2. **样式与结构就近表达。** 布局、间距、颜色、圆角、阴影等常见样式，优先在模板节点上直接声明，不要先写 CSS 再回头绑 class。
3. **确有需要时再开 `<style scoped>`。** 当你需要处理 `:deep()`、`:slotted()`、`:global()`，或 Tailwind 无法合理表达的 CSS 特性时，可以使用 `<style scoped>`。
4. **`@apply` 只在当前构建链稳定时使用。** 如果 scoped 样式里用 `@apply` 能稳定通过构建，可以继续使用；如果会和现有 Tailwind / CSS 管线冲突，就直接回退到原生 CSS。
5. **原生 CSS 只保留给 Tailwind 不擅长的场景。** 例如复杂动画、依赖变量的 `calc()`、浏览器特性选择器，或当前 utility 无法清晰表达的样式。

## 负面限制

1. **不要把 `<style>` 块当默认起手式。** 能在模板中表达的样式，不要平移到 CSS 块里。
2. **不要为页面局部需求污染全局样式。** 局部样式优先放在组件自身；只有真正的全局 token 或设计系统规则，才进入共享样式文件。
3. **不要机械追求 `@apply`。** 如果 `@apply` 已知会触发构建错误（例如 utility 无法被解析），直接写原生 CSS 更稳妥。
4. **不要用冗长 CSS 替代清晰的 utility 组合。** 简单布局、状态样式、响应式断点优先用 Tailwind 原生表达。

## 例子

### 推荐：模板内直接表达常见样式

```vue
<template>
  <div class="rounded-xl bg-white p-4 shadow-md">
    <button class="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600">
      Toggle
    </button>
    <ChildComponent class="mt-4" />
  </div>
</template>
```

### 允许：对深层子节点使用 scoped 样式

```vue
<template>
  <ChildComponent class="custom-wrapper" />
</template>

<style scoped>
.custom-wrapper :deep(.child-inner-element) {
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

### 避免：本可用 utility 完成却额外拆出 CSS

```vue
<!-- ❌ Avoid: 仅为了普通间距/颜色/圆角而新建一整段样式块 -->
```
