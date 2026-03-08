import type { Token } from "@cat/plugin-core";
import type { EditorView } from "@codemirror/view";

import { useQuery } from "@pinia/colada";
import { useRefHistory } from "@vueuse/core";
import { defineStore, storeToRefs } from "pinia";
import { navigate } from "vike/client/router";
import { ref, computed, watch } from "vue";
import * as z from "zod";

import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import {
  TranslatableElementWithDetailsSchema,
  useEditorElementStore,
} from "@/app/stores/editor/element.ts";
import { useProfileStore } from "@/app/stores/profile.ts";
import { hashJSON } from "@/app/utils/hash.ts";
import { orpc } from "@/server/orpc";

export const useEditorTableStore = defineStore("editorTable", () => {
  const context = storeToRefs(useEditorContextStore());
  const elementStore = useEditorElementStore();
  const elementRefStore = storeToRefs(elementStore);
  const profile = storeToRefs(useProfileStore());

  const inputDivEl = ref<HTMLDivElement>();
  /**
   * Reference to the CodeMirror EditorView instance.
   * Replaces the legacy `inputTextareaEl` ref.
   */
  const editorView = ref<EditorView | null>(null);

  const elementId = ref<number | null>(null);
  const translationValue = ref<string>("");
  const sourceTokens = ref<Token[]>([]);
  const translationTokens = ref<Token[]>([]);
  const searchQuery = ref("");
  const isProofreading = ref(false);

  const ghostText = ref<string | null>(null);

  const { undo, redo } = useRefHistory(translationValue);

  const element = computed(() => {
    if (!elementId.value) return null;
    return elementRefStore.storedElements.value.find(
      (el) => el.id === elementId.value,
    );
  });

  const elementLanguageId = computed(() => {
    if (!element.value) return null;
    return element.value.languageId;
  });

  const { state: elementTotalAmountState } = useQuery({
    key: ["documents", context.documentId.value!, "elementTotalAmount"],
    placeholderData: 0,
    query: async () => {
      if (!context.documentId.value || !context.languageToId.value) return 0;

      return await orpc.document.countElement({
        documentId: context.documentId.value,
        searchQuery: searchQuery.value,
        isTranslated: !isProofreading.value ? undefined : true,
        languageId: context.languageToId.value,
      });
    },
    enabled: !import.meta.env.SSR,
  });

  const elementTotalAmount = computed(() => {
    if (
      !context.documentId.value ||
      !context.languageToId.value ||
      !elementTotalAmountState.value ||
      !elementTotalAmountState.value.data
    )
      return 0;

    return elementTotalAmountState.value.data;
  });

  const pageTotalAmount = computed(() => {
    return Math.ceil(elementTotalAmount.value / context.pageSize.value);
  });

  const toElement = async (id: number) => {
    const page = await orpc.document.getPageIndexOfElement({
      elementId: id,
      pageSize: context.pageSize.value,
      searchQuery: searchQuery.value,
      isTranslated: !isProofreading.value ? undefined : true,
    });
    await toPage(page);
    elementId.value = id;
    translationValue.value = "";
    // 页码从 1 开始
    context.currentPage.value = page + 1;
  };

  // index 从 0 开始
  // 前端需要以此为标准映射页码
  const toPage = async (index: number) => {
    if (!context.documentId.value || !context.languageToId.value) return;

    const isTranslated = !isProofreading.value ? undefined : true;
    const inputHash = await hashJSON({
      pageSize: context.pageSize.value,
      searchQuery: searchQuery.value,
      isTranslated,
    });

    if (
      elementRefStore.loadedPagesIndex.value.includes(index) &&
      elementRefStore.loadedPageHashes.value.get(index) === inputHash
    ) {
      return;
    }

    await orpc.document
      .getElements({
        documentId: context.documentId.value,
        page: index,
        pageSize: context.pageSize.value,
        searchQuery: searchQuery.value,
        isTranslated,
        languageId: context.languageToId.value,
      })
      .then((elements) => {
        if (elements.length === 0) return;
        const pElements = z
          .array(TranslatableElementWithDetailsSchema)
          .parse(elements);
        elementRefStore.loadedPages.value.set(index, pElements);
        elementRefStore.loadedPageHashes.value.set(index, inputHash);
      });
  };

  const toNextUntranslated = async () => {
    if (
      !context.documentId.value ||
      !element.value ||
      !context.languageToId.value
    )
      return;

    const firstUntranslatedElement = await orpc.document.getFirstElement({
      documentId: context.documentId.value,
      greaterThan: element.value.sortIndex ?? 0,
      isTranslated: false,
      languageId: context.languageToId.value,
    });

    if (!firstUntranslatedElement) return;

    await toElement(firstUntranslatedElement.id);
    await navigate(
      `/editor/${context.documentId.value}/${context.languageToId.value}/${firstUntranslatedElement.id}`,
    );
  };

  const translate = async () => {
    if (
      !elementId.value ||
      !context.languageToId.value ||
      !context.document.value
    )
      return;

    elementStore.setElementPending(elementId.value, true);

    try {
      await orpc.translation.create({
        elementId: elementId.value,
        languageId: context.languageToId.value,
        text: translationValue.value,
        createMemory: profile.editorMemoryAutoCreateMemory.value,
      });
    } catch (error) {
      elementStore.setElementPending(elementId.value, false);
      throw error;
    }
  };

  const replace = (value: string) => {
    translationValue.value = value;
  };

  const clear = () => {
    translationValue.value = "";
  };

  const insert = async (value: string) => {
    if (!element.value) return;

    if (editorView.value) {
      const view = editorView.value;
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: value },
        selection: { anchor: from + value.length },
      });
      view.focus();
    } else {
      // Fallback: append to end
      translationValue.value = translationValue.value + value;
    }
  };

  const setGhostText = (text: string) => {
    ghostText.value = text;
  };

  const clearGhostText = () => {
    ghostText.value = null;
  };

  const acceptGhostText = () => {
    if (ghostText.value) {
      translationValue.value = ghostText.value;
      ghostText.value = null;
    }
  };

  /**
   * Ghost text is visible when the current input is a prefix of the ghost text.
   */
  const showGhost = computed(
    () =>
      ghostText.value !== null &&
      ghostText.value.startsWith(translationValue.value),
  );

  // Clear ghost text when the input no longer matches the ghost text prefix
  watch(translationValue, (val) => {
    if (ghostText.value !== null && !ghostText.value.startsWith(val)) {
      clearGhostText();
    }
  });

  watch(elementId, () => {
    clearGhostText();
  });

  return {
    elementId,
    translationValue,
    inputDivEl,
    editorView,
    sourceTokens,
    translationTokens,
    searchQuery,
    isProofreading,
    element,
    elementTotalAmount,
    elementLanguageId,
    pageTotalAmount,
    ghostText,
    showGhost,
    toElement,
    toPage,
    toNextUntranslated,
    translate,
    replace,
    clear,
    insert,
    setGhostText,
    clearGhostText,
    acceptGhostText,
    redo,
    undo,
  };
});
