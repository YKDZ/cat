---
description: Bilingual TSDoc requirements for exported symbols and Vue-exposed APIs.
paths: ["**/*.{ts,vue}"]
---

# 双语 TSDoc 规范

## 正面限制

1. **以下对外符号必须补双语 TSDoc。**
   - 所有 `export` 的函数、类、接口、类型别名、枚举、常量
   - 导出类、接口、对象字面量上的公共成员（属性 / 方法）
   - 会把类型化 API 暴露给调用方的 Vue SFC 宏：`defineProps`、`defineEmits`、`defineExpose`、`defineSlots`、`defineModel`
2. **统一使用 `@zh` 和 `@en`。** 中文在前，英文在后；两种语言都要完整描述同一语义。
3. **`@param` 与 `@returns` 使用内联双语标签。** 格式统一为 `{@zh …} {@en …}`。
4. **`@returns` 必须写成 `@returns - ...`。** `- ` 不是装饰，它是为了避免 TypeScript 的 JSDoc 解析器把 `{` 误判为类型表达式起点。
5. **代码与文档必须一起演进。** 符号签名、行为、命名一旦变化，对应 TSDoc 也必须同步更新或删除。

## 允许省略

当标识符语义完全自解释、没有任何歧义时，可以省略 TSDoc。典型例子包括：

- `name`
- `id`
- `description`
- `label`
- `title`
- `toString`
- `valueOf`
- `toJSON`

拿不准时，**宁可补注释，也不要赌调用方会心领神会**。

## 负面限制

1. **不要只写单语注释。** 双语要求是成对的，不能只更新中文或只更新英文。
2. **不要交换顺序。** 一律 `@zh` 在前，`@en` 在后。
3. **不要让注释与代码失真。** 过时注释比没有注释更糟糕。
4. **不要把 `defineOptions` 当成必须文档化的公开 API。** 它声明的是组件内部选项，不是暴露给调用方的接口。
5. **不要省略 `@returns -` 里的短横线。** 少了这一笔，解析器就可能开始整活。

## 例子

### 函数 / 常量

```ts
/**
 * @zh 根据语言代码获取对应的显示名称。
 * @en Get the display name for the given language code.
 *
 * @param code - {@zh 语言代码（BCP 47）} {@en BCP 47 language code}
 * @returns - {@zh 语言显示名称} {@en Display name of the language}
 */
export const getLanguageName = (code: string): string => {
  return code;
};
```

### 接口 / 类型

```ts
/**
 * @zh 翻译记忆条目。
 * @en A translation memory entry.
 */
export interface TMEntry {
  /**
   * @zh 源语言文本。
   * @en Source language text.
   */
  source: string;

  /**
   * @zh 目标语言文本。
   * @en Target language text.
   */
  target: string;
}
```

### Vue 宏（`defineProps` / `defineEmits` / `defineModel` / `defineSlots` / `defineExpose`）

```vue
<script setup lang="ts">
/**
 * @zh 术语表项的属性。
 * @en Props for the glossary entry component.
 */
const props = defineProps<{
  /**
   * @zh 术语在源语言中的文本。
   * @en The term text in the source language.
   */
  sourceTerm: string;

  /**
   * @zh 术语在目标语言中的翻译。
   * @en Translation of the term in the target language.
   */
  targetTerm: string;
}>();

const emit = defineEmits<{
  /**
   * @zh 当用户确认修改后触发。
   * @en Emitted when the user confirms the edit.
   */
  (e: "confirm", value: string): void;
}>();

/**
 * @zh 当前选中的术语，支持 v-model 双向绑定。
 * @en Currently selected term, supports v-model two-way binding.
 */
const selectedTerm = defineModel<string>("selectedTerm");

defineSlots<{
  /**
   * @zh 默认插槽，用于渲染术语详情。
   * @en Default slot for rendering term details.
   */
  default(props: { term: string }): void;
}>();

/**
 * @zh 重置表单为初始状态。
 * @en Reset the form to its initial state.
 */
const reset = () => {};

defineExpose({ reset });
</script>
```
