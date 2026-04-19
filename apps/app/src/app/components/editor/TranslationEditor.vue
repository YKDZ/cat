<script setup lang="ts">
import { history, historyKeymap } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { keymap, drawSelection } from "@codemirror/view";
import { useDebounceFn } from "@vueuse/core";
import { storeToRefs } from "pinia";
import { onMounted, onUnmounted, watch } from "vue";
import { ref } from "vue";
import { useI18n } from "vue-i18n";

import { ws } from "@/app/rpc/ws";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { useEditorGhostTextStore } from "@/app/stores/editor/ghost-text.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";

import {
  ghostTextExtension,
  ghostTextStateField,
  setGhostTextEffect,
  clearGhostTextEffect,
  acceptWordGhostTextEffect,
} from "./extensions/ghost-text.ts";
import {
  linkClickHandler,
  setTokensEffect,
  tokenDecorationExtension,
} from "./extensions/token-decorations.ts";
import {
  tokenTooltipExtension,
  tokenTooltipTheme,
} from "./extensions/token-tooltips.ts";

const { t } = useI18n();

// ─── Store References ───

const tableStore = useEditorTableStore();
const { translationValue, elementId, translationTokens } =
  storeToRefs(tableStore);

const contextStore = useEditorContextStore();
const { languageToId } = storeToRefs(contextStore);

const ghostTextStore = useEditorGhostTextStore();
const { suggestion, anchorPosition } = storeToRefs(ghostTextStore);
const { advanceSuggestion } = ghostTextStore;

// ─── Editor Setup ───

const containerEl = ref<HTMLDivElement | null>(null);
let editorView: EditorView | null = null;

/** Prevent circular update loops: true when a change originates from the store */
let suppressCMUpdate = false;
/** Prevent circular update loops: true when a change originates from CodeMirror */
let suppressStoreUpdate = false;

// Ghost-text-aware placeholder: hides when a suggestion is active so the
// suggestion widget is not rendered on top of / after the placeholder text.
class PlaceholderWidget extends WidgetType {
  constructor(private readonly text: string) {
    super();
  }
  override toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.setAttribute("aria-hidden", "true");
    el.className = "cm-placeholder";
    el.style.pointerEvents = "none";
    el.style.userSelect = "none";
    el.textContent = this.text;
    return el;
  }
  override ignoreEvent(): boolean {
    return false;
  }
}

const makePlaceholder = (text: string) =>
  ViewPlugin.fromClass(
    class {
      decorations: ReturnType<typeof Decoration.set>;

      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }

      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.startState.field(ghostTextStateField) !==
            update.state.field(ghostTextStateField)
        ) {
          this.decorations = this.build(update.view);
        }
      }

      build(view: EditorView) {
        if (view.state.doc.length > 0) return Decoration.none;
        const ghostState = view.state.field(ghostTextStateField);
        if (ghostState.suggestion !== null) return Decoration.none;
        return Decoration.set([
          Decoration.widget({
            widget: new PlaceholderWidget(text),
            side: 1,
          }).range(0),
        ]);
      }
    },
    { decorations: (v) => v.decorations },
  );

const createEditor = () => {
  if (!containerEl.value) return;

  const startDoc = translationValue.value;

  const state = EditorState.create({
    doc: startDoc,
    extensions: [
      history(),
      keymap.of(historyKeymap),
      drawSelection(),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        // When Ctrl-ArrowRight accepts a ghost text word, keep remaining text
        // in the store so that the translationValue watcher does not clear it.
        if (
          update.transactions.some((tr) =>
            tr.effects.some((e) => e.is(acceptWordGhostTextEffect)),
          )
        ) {
          const newGhostState = update.state.field(ghostTextStateField);
          advanceSuggestion(
            newGhostState.suggestion,
            newGhostState.anchorPosition,
          );
        }

        if (!update.docChanged) return;
        if (suppressCMUpdate) return;

        const newText = update.state.doc.toString();
        suppressStoreUpdate = true;
        translationValue.value = newText;
        suppressStoreUpdate = false;
      }),
      makePlaceholder(t("在此输入译文")),
      ghostTextExtension,
      ...tokenDecorationExtension(),
      tokenTooltipExtension,
      tokenTooltipTheme,
      linkClickHandler,
    ],
  });

  editorView = new EditorView({
    state,
    parent: containerEl.value,
  });

  // Expose the EditorView to the table store so other stores can call
  // view.dispatch() for cursor-aware insert, undo, etc.
  tableStore.editorView = editorView;
};

// ─── Debounced tokenize：译文变化时更新 token 装饰 ───────────────────────────

const debouncedTokenize = useDebounceFn(async (text: string) => {
  const result = await ws.tokenizer.tokenize({
    text,
    elementId: elementId.value ?? undefined,
    translationLanguageId: languageToId.value ?? undefined,
  });
  const tokens = result.tokens;
  if (editorView) {
    editorView.dispatch({ effects: setTokensEffect.of(tokens) });
  }
  // 同步到 store，供 Toolbar QA 面板使用
  translationTokens.value = tokens;
}, 300);

// ─── Sync: store → CodeMirror ───

watch(translationValue, (newVal) => {
  if (suppressStoreUpdate) return;
  if (!editorView) return;

  const currentDoc = editorView.state.doc.toString();
  if (currentDoc === newVal) return;

  suppressCMUpdate = true;
  editorView.dispatch({
    changes: {
      from: 0,
      to: editorView.state.doc.length,
      insert: newVal,
    },
  });
  suppressCMUpdate = false;

  // 文档变化时触发 tokenize
  debouncedTokenize(newVal);
});

// ─── Sync: ghost text store → CodeMirror extension ───

watch([suggestion, anchorPosition], ([newSuggestion, newAnchor]) => {
  if (!editorView) return;

  // Get current state from the editor
  const currentState = editorView.state.field(ghostTextStateField, false);

  // Only sync if the store's suggestion differs from editor state
  // This prevents overwriting changes made by the Ctrl-ArrowRight keymap
  if (newSuggestion !== null) {
    if (currentState?.suggestion !== newSuggestion) {
      editorView.dispatch({
        effects: setGhostTextEffect.of({
          suggestion: newSuggestion,
          anchorPosition: newAnchor,
        }),
      });
    }
  } else {
    if (currentState?.suggestion !== null) {
      editorView.dispatch({
        effects: clearGhostTextEffect.of(null),
      });
    }
  }
});

// ─── Lifecycle ───

onMounted(() => {
  createEditor();
  // 初始化时触发一次 tokenize
  if (translationValue.value) {
    debouncedTokenize(translationValue.value);
  }
});

onUnmounted(() => {
  editorView?.destroy();
  editorView = null;
  tableStore.editorView = null;
});

// ─── Public API (exposed for parent components) ───

const focus = () => {
  editorView?.focus();
};

const getCursorPosition = () => {
  return editorView?.state.selection.main.head ?? 0;
};

defineExpose({ focus, getCursorPosition });
</script>

<template>
  <div ref="containerEl" class="translation-editor min-h-32 w-full" />
</template>

<style scoped>
.translation-editor :deep(.cm-editor) {
  outline: none;
  width: 100%;
  min-height: 8rem;
  font-family: inherit;
  font-size: inherit;
}

.translation-editor :deep(.cm-content) {
  padding: 1.25rem;
  white-space: pre-wrap;
  word-break: break-word;
}

.translation-editor :deep(.cm-focused) {
  outline: none;
}

.translation-editor :deep(.cm-scroller) {
  overflow: auto;
}
</style>
