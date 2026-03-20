<script setup lang="ts">
import type { Token } from "@cat/plugin-core";

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useQuery } from "@pinia/colada";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import { ws } from "@/app/rpc/ws";

import {
  linkClickHandler,
  setTokensEffect,
  tokenDecorationExtension,
} from "./extensions/token-decorations";
import {
  tokenTooltipExtension,
  tokenTooltipTheme,
} from "./extensions/token-tooltips";

const props = defineProps<{
  text: string;
  elementId?: number;
  translationLanguageId?: string;
}>();


const emit = defineEmits<{
  (e: "update", tokens: Token[]): void;
}>();


// ─── 查询键：包含 text、elementId、translationLanguageId ─────────────────────


const queryKey = computed(() => [
  "tokenize",
  props.text,
  props.elementId ?? null,
  props.translationLanguageId ?? null,
]);


// ─── 调用后端 tokenize API ────────────────────────────────────────────────────


const { state } = useQuery({
  key: queryKey,
  placeholderData: () => ({
    tokens: [
      {
        value: props.text,
        start: 0,
        end: props.text.length,
        type: "text" as const,
      },
    ],
  }),
  query: async () =>
    ws.tokenizer.tokenize({
      text: props.text,
      elementId: props.elementId,
      translationLanguageId: props.translationLanguageId,
    }),
  enabled: !import.meta.env.SSR,
});


// ─── CM6 编辑器（只读模式）────────────────────────────────────────────────────


const containerEl = ref<HTMLDivElement | null>(null);
let editorView: EditorView | null = null;


const createEditor = () => {
  if (!containerEl.value) return;


  const editorState = EditorState.create({
    doc: props.text,
    extensions: [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.lineWrapping,
      ...tokenDecorationExtension(),
      tokenTooltipExtension,
      tokenTooltipTheme,
      linkClickHandler,
    ],
  });


  editorView = new EditorView({
    state: editorState,
    parent: containerEl.value,
  });
};


// ─── 同步：text prop 变化时更新文档内容 ──────────────────────────────────────


watch(
  () => props.text,
  (newText) => {
    if (!editorView) return;
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: newText,
      },
    });
  },
);


// ─── 同步：tokens 变化时更新 CM6 装饰 ────────────────────────────────────────


watch(
  () => state.value.data?.tokens,
  (tokens) => {
    if (!tokens || !editorView) return;
    editorView.dispatch({ effects: setTokensEffect.of(tokens) });
    emit("update", tokens);
  },
  { immediate: false },
);


// ─── 生命周期 ─────────────────────────────────────────────────────────────────


onMounted(() => {
  createEditor();

  // 初始化时若已有 tokens 数据，立即应用
  const initialTokens = state.value.data?.tokens;
  if (initialTokens && editorView) {
    editorView.dispatch({ effects: setTokensEffect.of(initialTokens) });
    emit("update", initialTokens);
  }
});


onUnmounted(() => {
  editorView?.destroy();
  editorView = null;
});
</script>

<template>
  <div
    ref="containerEl"
    class="token-viewer w-full font-sans text-base leading-relaxed"
  />
</template>

<style scoped>
.token-viewer :deep(.cm-editor) {
  outline: none;
  width: 100%;
}

.token-viewer :deep(.cm-content) {
  padding: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: inherit;
}

.token-viewer :deep(.cm-line) {
  padding: 0;
}

.token-viewer :deep(.cm-focused) {
  outline: none;
}

.token-viewer :deep(.cm-scroller) {
  overflow: visible;
}

/* 只读编辑器移除光标样式 */
.token-viewer :deep(.cm-cursor) {
  display: none;
}

/* Tooltip 样式 */
.token-viewer :deep(.cm-tooltip) {
  border-radius: 6px;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -2px rgba(0, 0, 0, 0.1);
}
</style>
