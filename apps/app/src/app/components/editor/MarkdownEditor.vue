<script setup lang="ts">
import { markdown } from "@codemirror/lang-markdown";
import { history, historyKeymap } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  keymap,
  placeholder,
} from "@codemirror/view";
import { Images } from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import Markdown from "@/app/components/Markdown.vue";
import {
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@cat/app-ui";

const { t } = useI18n();

const content = defineModel<string>({ default: "" });
const activeTab = ref<"edit" | "preview">("edit");

const contentToPreview = computed(() =>
  content.value.length === 0 ? t("没有可预览的内容") : content.value,
);

// ─── CodeMirror Setup ───

const containerEl = ref<HTMLDivElement | null>(null);
let editorView: EditorView | null = null;

/** 变更来自 store 时置为 true，避免循环更新 */
let suppressCMUpdate = false;
/** 变更来自 CodeMirror 时置为 true，避免循环更新 */
let suppressModelUpdate = false;

const editorTheme = EditorView.theme({
  "&": {
    fontSize: "inherit",
    fontFamily: "inherit",
    background: "transparent",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-content": {
    padding: "0.5rem",
    minHeight: "8rem",
    caretColor: "var(--foreground)",
  },
  ".cm-scroller": { overflow: "auto" },
  ".cm-line": { color: "var(--foreground)" },
  // Markdown 语法高亮：标题
  ".cm-header-1, .cm-header-2, .cm-header-3": { fontWeight: "bold" },
  // 粗体 / 斜体
  ".cm-strong": { fontWeight: "bold" },
  ".cm-em": { fontStyle: "italic" },
  // 代码
  ".cm-monospace": { fontFamily: "monospace", fontSize: "0.9em" },
  // 引用
  ".cm-quote": { color: "var(--muted-foreground)" },
  // 链接
  ".cm-link": { textDecoration: "underline" },
  // 占位符
  ".cm-placeholder": { color: "var(--muted-foreground)" },
});

const createEditor = () => {
  if (!containerEl.value) return;

  const state = EditorState.create({
    doc: content.value,
    extensions: [
      history(),
      keymap.of(historyKeymap),
      drawSelection(),
      EditorView.lineWrapping,
      markdown(),
      placeholder(t("在此输入文本")),
      editorTheme,
      EditorView.updateListener.of((update) => {
        if (!update.docChanged || suppressCMUpdate) return;
        suppressModelUpdate = true;
        content.value = update.state.doc.toString();
        suppressModelUpdate = false;
      }),
    ],
  });

  editorView = new EditorView({
    state,
    parent: containerEl.value,
  });
};

// ─── Sync: model → CodeMirror ───

watch(content, (newVal) => {
  if (suppressModelUpdate || !editorView) return;
  const currentDoc = editorView.state.doc.toString();
  if (currentDoc === newVal) return;

  suppressCMUpdate = true;
  editorView.dispatch({
    changes: { from: 0, to: editorView.state.doc.length, insert: newVal },
  });
  suppressCMUpdate = false;
});

// ─── Lifecycle ───

onMounted(() => {
  createEditor();
});

onUnmounted(() => {
  editorView?.destroy();
  editorView = null;
});
</script>

<template>
  <div class="bg-muted">
    <Tabs v-model="activeTab">
      <TabsList>
        <TabsTrigger value="edit">
          {{ t("编辑") }}
        </TabsTrigger>
        <TabsTrigger value="preview">
          {{ t("预览") }}
        </TabsTrigger>
      </TabsList>
      <!-- 编辑器容器始终保留在 DOM 中，用 v-show 控制可见性，避免 CodeMirror 实例被销毁 -->
      <div
        v-show="activeTab === 'edit'"
        class="markdown-editor min-h-32 w-full"
        ref="containerEl"
      />
      <TabsContent value="preview">
        <Markdown :content="contentToPreview" class="min-h-32 p-2" />
      </TabsContent>
    </Tabs>

    <div class="flex gap-1 p-1 text-xs">
      <span class="flex items-center gap-1 p-1">
        <div class="icon-[mdi--language-markdown-outline] size-4" />
        {{ t("支持 Markdown 语法") }}
      </span>
      <Separator orientation="vertical" />
      <span class="flex items-center gap-1 p-1">
        <Images class="size-3" />{{ t("拖放或通过按钮上传图片") }}
      </span>
    </div>

    <div>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.markdown-editor :deep(.cm-editor) {
  width: 100%;
  min-height: 8rem;
}

.markdown-editor :deep(.cm-focused) {
  outline: none;
}
</style>
