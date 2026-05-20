import type { Token } from "@cat/plugin-core";
import type { EditorView } from "@codemirror/view";

import { useQuery, useQueryCache } from "@pinia/colada";
import { useRefHistory } from "@vueuse/core";
import { defineStore, storeToRefs } from "pinia";
import { navigate } from "vike/client/router";
import { ref, computed } from "vue";

import { buildEditorHref } from "@/pages/editor/scope-url";
import { orpc } from "@/rpc/orpc";
import { useEditorContextStore } from "@/stores/editor/context.ts";
import { useEditorElementStore } from "@/stores/editor/element.ts";
import { useProfileStore } from "@/stores/profile.ts";

export const useEditorTableStore = defineStore("editorTable", () => {
  const contextStore = useEditorContextStore();
  const context = storeToRefs(contextStore);
  const elementStore = useEditorElementStore();
  const elementRefStore = storeToRefs(elementStore);
  const profile = storeToRefs(useProfileStore());
  const queryCache = useQueryCache();

  const inputDivEl = ref<HTMLDivElement>();
  /**
   * Reference to the CodeMirror EditorView instance.
   * Replaces the legacy `inputTextareaEl` ref.
   */
  const editorView = ref<EditorView | null>(null);

  const elementId = ref<number | null>(null);
  const translationValue = ref("");
  const sourceTokens = ref<Token[]>([]);
  const translationTokens = ref<Token[]>([]);

  const { undo, redo } = useRefHistory(translationValue);

  const countScope = computed(() => {
    if (!context.scope.value) return null;

    return {
      projectId: context.scope.value.projectId,
      languageToId: context.scope.value.languageToId,
      branchId: context.scope.value.branchId,
      contentNodeIds: context.scope.value.contentNodeIds,
      searchQuery: context.scope.value.searchQuery,
      statusFilter: context.scope.value.statusFilter,
    };
  });

  const searchQuery = computed({
    get: () => context.searchQuery.value,
    set: (value: string) => {
      contextStore.setSearchQuery(value);
    },
  });

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
    key: () => ["editor-scope", countScope.value, "elementTotalAmount"],
    placeholderData: 0,
    query: async () => {
      if (!countScope.value) return 0;
      return await orpc.editor.countElements(countScope.value);
    },
    enabled: () => !import.meta.env.SSR && !!countScope.value,
  });

  const elementTotalAmount = computed(
    () => elementTotalAmountState.value.data ?? 0,
  );

  const pageTotalAmount = computed(() =>
    Math.ceil((elementTotalAmount.value ?? 0) / context.pageSize.value),
  );

  const setCurrentElementContext = (
    selectedElement: typeof element.value | null,
  ) => {
    contextStore.currentElementContentNodeId =
      selectedElement?.primaryContentNodeId ?? undefined;
  };

  /**
   * @zh 如果目标元素已经在本地缓存页中，则立即选中它。
   * @en Immediately select the target element if it is already cached locally.
   *
   * @param targetElementId - {@zh 目标元素 ID} {@en Target element ID}
   * @returns - {@zh 是否命中了本地缓存} {@en Whether the local cache was hit}
   */
  const selectLoadedElement = (targetElementId: number): boolean => {
    for (const [pageIndex, rows] of elementStore.loadedPages.entries()) {
      const selected = rows.find((item) => item.id === targetElementId);

      if (!selected) continue;

      contextStore.setCurrentPage(pageIndex + 1);
      setCurrentElementContext(selected);
      elementId.value = targetElementId;

      return true;
    }

    return false;
  };

  const toElement = async (targetElementId: number) => {
    if (!context.scope.value) return;

    if (selectLoadedElement(targetElementId)) return;

    const pageIndex = await orpc.editor.getElementPageIndex({
      ...context.scope.value,
      elementId: targetElementId,
      pageSize: context.pageSize.value,
    });

    if (pageIndex === null) {
      const first = await orpc.editor.getFirstElement(context.scope.value);

      if (!first) {
        elementId.value = null;
        setCurrentElementContext(null);
        await navigate(buildEditorHref(context.scope.value, "empty"));
        return;
      }

      elementId.value = first.id;
      setCurrentElementContext(first);
      await navigate(buildEditorHref(context.scope.value, first.id));
      return;
    }

    contextStore.setCurrentPage(pageIndex + 1);
    const rows = await elementStore.loadPage(pageIndex);
    const selected = rows.find((item) => item.id === targetElementId) ?? null;
    setCurrentElementContext(selected);
    elementId.value = targetElementId;
  };

  const toPage = async (page: number) => {
    if (!context.scope.value) return;

    contextStore.setCurrentPage(page);
    const rows = await elementStore.loadPage(page - 1);

    // Navigate to the first element on the new page (not the previously
    // selected element). This ensures that on a hard refresh the URL encodes
    // an element that actually belongs to this page, so toElement() confirms
    // currentPage == page instead of overriding it back to page 1.
    const target = rows[0]?.id ?? "auto";

    if (contextStore.scope) {
      await navigate(buildEditorHref(contextStore.scope, target));
    }
  };

  const toNextUntranslated = async () => {
    if (!context.scope.value || !elementId.value) return;

    const firstUntranslatedElement = await orpc.editor.getFirstElement({
      ...context.scope.value,
      statusFilter: "untranslated",
      afterElementId: elementId.value,
    });

    if (!firstUntranslatedElement) {
      await navigate(buildEditorHref(context.scope.value, "empty"));
      return;
    }

    await toElement(firstUntranslatedElement.id);
    if (contextStore.scope) {
      await navigate(
        buildEditorHref(contextStore.scope, firstUntranslatedElement.id),
      );
    }
  };

  const translate = async () => {
    if (!elementId.value || !context.languageToId.value) return;

    const currentElementId = elementId.value;
    const currentLanguageId = context.languageToId.value;

    elementStore.setElementPending(currentElementId, true);

    try {
      await orpc.translation.create({
        elementId: currentElementId,
        languageId: currentLanguageId,
        text: translationValue.value,
        createMemory: profile.editorMemoryAutoCreateMemory.value,
      });

      // Ensure the translation list updates even if the SSE event races.
      void queryCache.invalidateQueries({
        key: ["translations", currentElementId, currentLanguageId],
        exact: true,
      });
    } catch (error) {
      elementStore.setElementPending(currentElementId, false);
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

  return {
    elementId,
    translationValue,
    inputDivEl,
    editorView,
    sourceTokens,
    translationTokens,
    searchQuery,
    element,
    elementTotalAmount,
    elementLanguageId,
    pageTotalAmount,
    selectLoadedElement,
    toElement,
    toPage,
    toNextUntranslated,
    translate,
    replace,
    clear,
    insert,
    redo,
    undo,
  };
});
