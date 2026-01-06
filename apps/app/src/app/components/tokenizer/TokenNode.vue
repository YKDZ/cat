<script setup lang="ts">
import { computed } from "vue";
import type { Token } from "@cat/plugin-core";

const props = withDefaults(
  defineProps<{
    token: Token;
    interactable?: boolean;
    layerIndex?: number; // 用于控制嵌套深度的颜色
  }>(),
  {
    interactive: false,
    layerIndex: 0,
  },
);

const emit = defineEmits<{
  (e: "click", token: Token): void;
}>();

const bgColorClass = computed(() => {
  // 只有特定类型才需要背景高亮
  const shouldHighlight =
    props.token.type === "variable" ||
    props.token.type === "term" ||
    props.token.type === "mask" ||
    props.token.type === "link";

  if (!shouldHighlight) return "";

  // 基础颜色 200, 每一层 + 100
  const level = Math.min(2 + props.layerIndex, 9);
  return `bg-gray-${level}00/50`; // 使用 /50 透明度让叠加更自然
});

const hoverClass = computed(() => {
  if (!props.interactable) return "";
  const level = Math.min(3 + props.layerIndex, 9);
  return `hover:bg-gray-${level}00/80`;
});

// 字体颜色与特殊修饰
const tokenTypeClass = computed(() => {
  switch (props.token.type) {
    case "variable":
      return "text-blue-600 font-mono";
    case "term":
      return "text-purple-600 border-b-2 border-purple-200";
    case "mask":
      return "text-gray-500 opacity-80 cursor-not-allowed select-none"; // 保护内容样式
    case "link":
      return "text-sky-600 underline decoration-sky-300";
    case "unknown":
      return "text-red-500";
    default:
      return "text-foreground";
  }
});
</script>

<template>
  <span
    class="inline-block transition-colors duration-200 whitespace-pre-wrap"
    :class="[
      bgColorClass,
      tokenTypeClass,
      {
        'cursor-pointer': interactable,
        [hoverClass]: interactable && bgColorClass,
      },
    ]"
    :title="token.meta ? JSON.stringify(token.meta) : undefined"
  >
    <template v-if="token.children && token.children.length > 0">
      <TokenNode
        v-for="(child, i) in token.children"
        :key="i"
        :token="child"
        :interactable="interactable"
        :layer-index="layerIndex + 1"
        @click="(t) => emit('click', t)"
      />
    </template>

    <span v-else class="whitespace-pre-wrap">{{ token.value }}</span>
  </span>
</template>
