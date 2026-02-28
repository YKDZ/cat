<script setup lang="ts">
import { computed } from "vue";
import type { Token } from "@cat/plugin-core";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@cat/app-ui";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useI18n } from "vue-i18n";

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

const { t } = useI18n();

const editorTableStore = useEditorTableStore();

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
      return "text-gray-500 opacity-80 cursor-not-allowed select-none";
    case "link":
      return "text-sky-600 underline decoration-sky-300";
    case "unknown":
      return "text-red-500";
    default:
      return "text-foreground";
  }
});

// 格式化 JSON meta 用于显示
const formattedMeta = computed(() => {
  if (!props.token.meta) return null;
  return JSON.stringify(props.token.meta, null, 2);
});

// 获取术语或变量的翻译文本
const translationText = computed(() => {
  if (props.token.type !== "term" && props.token.type !== "variable") {
    return null;
  }

  const meta = props.token.meta;
  if (!meta) return null;

  // 术语类型：从 meta 中获取 translation
  if (props.token.type === "term" && "translation" in meta) {
    return meta.translation as string;
  }

  // 变量类型：从 meta 中获取 value 或 translation
  if (props.token.type === "variable") {
    return (meta.translation || meta.value) as string;
  }

  return null;
});

// 处理点击事件
const handleClick = () => {
  // 优先触发原有的 click 事件
  emit("click", props.token);

  // 如果是术语或变量，且有翻译文本，则插入到输入栏
  if (
    props.interactable &&
    translationText.value &&
    (props.token.type === "term" || props.token.type === "variable")
  ) {
    editorTableStore.insert(translationText.value);
  }
};
</script>

<template>
  <TooltipProvider v-if="formattedMeta && interactable">
    <Tooltip>
      <TooltipTrigger as-child>
        <span
          class="inline-block whitespace-pre-wrap transition-colors duration-200"
          :class="[
            bgColorClass,
            tokenTypeClass,
            {
              'cursor-pointer': interactable,
              [hoverClass]: interactable && bgColorClass,
              'cursor-help': formattedMeta,
            },
          ]"
          @click="handleClick"
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
      </TooltipTrigger>
      <TooltipContent
        class="max-w-md overflow-hidden rounded-lg border bg-popover p-0 text-popover-foreground shadow-md"
        :hide-arrow="true"
      >
        <div class="bg-linear-to-r from-muted/50 to-muted/30 px-3 py-2">
          <div class="text-xs font-semibold text-muted-foreground">
            {{ t("元数据") }}
          </div>
        </div>
        <pre
          class="max-h-64 overflow-auto p-3 font-mono text-xs leading-relaxed"
        ><code>{{ formattedMeta }}</code></pre>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>

  <span
    v-else
    class="inline-block whitespace-pre-wrap transition-colors duration-200"
    :class="[
      bgColorClass,
      tokenTypeClass,
      {
        'cursor-pointer': interactable,
        [hoverClass]: interactable && bgColorClass,
      },
    ]"
    @click="handleClick"
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
