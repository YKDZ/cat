---
description: Bilingual TSDoc requirements for exported symbols and Vue-exposed APIs.
paths: ["**/*.{ts,vue}"]
---

# Bilingual TSDoc Guidelines

## 1. Mandatory Documentation Scope

The following symbols **must** have bilingual TSDoc comments:

- All `export`-ed functions, classes, interfaces, type aliases, enums, and constants
- All public members (properties, methods) of exported classes, interfaces, and object literals
- Vue SFC compiler macros that expose typed APIs to callers: `defineProps`, `defineEmits`, `defineExpose`, `defineSlots`, `defineModel` — document their properties, events, slots, and model definitions respectively
- `defineOptions` does **not** require TSDoc (it declares internal component options, not caller-facing APIs)

## 2. Bilingual Format

Use the custom block tags `@zh` and `@en` to separate Chinese and English descriptions. Chinese comes first.

**Function / Variable example:**

```typescript
/**
 * @zh 根据语言代码获取对应的语言显示名称。
 * @en Get the display name for the given language code.
 *
 * @param code - {@zh 语言代码（BCP 47）} {@en BCP 47 language code}
 * @returns - {@zh 语言显示名称} {@en Display name of the language}
 */
export const getLanguageName = (code: string): string => { … };
```

**Interface / Type example:**

```typescript
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

**Vue `defineProps` / `defineEmits` / `defineExpose` / `defineSlots` / `defineModel` example:**

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

  /**
   * @zh 页脚插槽，用于放置操作按钮。
   * @en Footer slot for action buttons.
   */
  footer(): void;
}>();

/**
 * @zh 重置表单为初始状态。
 * @en Reset the form to its initial state.
 */
const reset = () => { … };

defineExpose({ reset });
</script>
```

## 3. Self-Explanatory Name Exemption

You may **omit** TSDoc when the identifier name alone fully conveys its purpose and semantics, leaving zero ambiguity. Typical exempt names include:

- `name`, `id`, `description`, `label`, `title`, `toString`, `valueOf`, `toJSON`

When in doubt, **add the doc**. A short redundant comment is cheaper than a missing one.

## 4. Inline Parameter & Return Descriptions

For `@param` and `@returns` tags, embed both languages using inline `{@zh …} {@en …}` custom inline tags (as shown in the examples above) to keep parameter docs compact.

**Important**: `@returns` MUST use a dash prefix before any `{@...}` inline tag: `@returns - {@zh …} {@en …}`. TypeScript's JSDoc parser treats `{` immediately after `@returns` as a type expression start, which corrupts all inline tags (`{@zh}`, `{@en}`, `{@link}`, etc.). The `- ` separator prevents this misparse.

## 5. Keep Docs in Sync with Code

When modifying a symbol that already has TSDoc, you **must** update or remove the corresponding comments to match the new behavior:

- **Signature change** (parameters added/removed/renamed, return type changed): update `@param`, `@returns`, and description accordingly.
- **Semantics change** (behavior differs while signature stays the same): update the `@zh` / `@en` description to reflect the new behavior.
- **Symbol removed**: delete its TSDoc along with the code.
- **Symbol renamed**: update the TSDoc if the new name no longer matches the old description.

Stale or contradictory documentation is **worse** than no documentation. Treat TSDoc updates as part of the same commit that changes the code.

## 6. Consistency Rules

- Always place `@zh` before `@en`.
- Keep both languages in sync — do not leave one language outdated.
- Use concise, complete sentences ending with a period (Chinese：句号 `。`; English: period `.`).
