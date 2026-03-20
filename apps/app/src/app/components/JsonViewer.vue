<script setup lang="ts">
import { json } from "@codemirror/lang-json";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{
  value: unknown;
}>();


const containerEl = ref<HTMLDivElement | null>(null);
let editorView: EditorView | null = null;


const stringify = (val: unknown): string => {
  try {
    return JSON.stringify(val, null, 2) ?? "null";
  } catch {
    return "null";
  }
};


const editorTheme = EditorView.theme({
  "&": {
    fontSize: "0.8rem",
    fontFamily: "monospace",
    background: "transparent",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-content": { padding: "0.5rem", caretColor: "var(--foreground)" },
  ".cm-scroller": { overflow: "auto" },
  ".cm-line": { color: "var(--foreground)" },
});


onMounted(() => {
  if (!containerEl.value) return;

  const state = EditorState.create({
    doc: stringify(props.value),
    extensions: [
      json(),
      editorTheme,
      EditorState.readOnly.of(true),
      EditorView.lineWrapping,
    ],
  });

  editorView = new EditorView({
    state,
    parent: containerEl.value,
  });
});


watch(
  () => props.value,
  (newVal) => {
    if (!editorView) return;
    const newDoc = stringify(newVal);
    const currentDoc = editorView.state.doc.toString();
    if (newDoc === currentDoc) return;
    editorView.dispatch({
      changes: { from: 0, to: currentDoc.length, insert: newDoc },
    });
  },
);


onBeforeUnmount(() => {
  editorView?.destroy();
  editorView = null;
});
</script>

<template>
  <div
    ref="containerEl"
    class="size-full overflow-auto rounded border bg-muted/30"
  />
</template>
