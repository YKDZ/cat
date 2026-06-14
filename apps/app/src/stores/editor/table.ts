import type { Token } from "@cat/plugin-core";
import type { EditorView } from "@codemirror/view";

import { useQuery, useQueryCache } from "@pinia/colada";
import { useRefHistory } from "@vueuse/core";
import { defineStore, storeToRefs } from "pinia";
import { navigate } from "vike/client/router";
import { computed, reactive, ref } from "vue";

import { buildEditorHref } from "@/pages/editor/scope-url";
import { orpc } from "@/rpc/orpc";
import { useEditorContextStore } from "@/stores/editor/context.ts";
import {
  useEditorElementStore,
  type TranslatableElementWithDetails,
} from "@/stores/editor/element.ts";
import { useProfileStore } from "@/stores/profile.ts";
import { useProjectWriteCapabilityStore } from "@/stores/write-capability.ts";

export const useEditorTableStore = defineStore("editorTable", () => {
  const contextStore = useEditorContextStore();
  const context = storeToRefs(contextStore);
  const elementStore = useEditorElementStore();
  const elementRefStore = storeToRefs(elementStore);
  const profile = storeToRefs(useProfileStore());
  const writeCapability = useProjectWriteCapabilityStore();
  const writeCapabilityRefs = storeToRefs(writeCapability);
  const queryCache = useQueryCache();

  const inputDivEl = ref<HTMLDivElement>();
  /**
   * Reference to the CodeMirror EditorView instance.
   * Replaces the legacy `inputTextareaEl` ref.
   */
  const editorView = ref<EditorView | null>(null);

  const elementId = ref<number | null>(null);
  const selectedElementSnapshot = ref<TranslatableElementWithDetails | null>(
    null,
  );
  const externalElementLanguageId = ref<string | null>(null);
  const translationValue = ref("");
  const sourceTokens = ref<Token[]>([]);
  const translationTokens = ref<Token[]>([]);
  const draftCache = reactive(new Map<string, string>());

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

    const loadedElement = elementRefStore.storedElements.value.find(
      (el) => el.id === elementId.value,
    );
    if (loadedElement) {
      return loadedElement;
    }

    if (selectedElementSnapshot.value?.id === elementId.value) {
      return selectedElementSnapshot.value;
    }

    return null;
  });

  const elementLanguageId = computed(() => {
    if (!element.value) return null;
    return element.value.languageId;
  });

  const resolvedElementLanguageId = computed(() => {
    if (elementLanguageId.value) {
      return elementLanguageId.value;
    }

    return externalElementLanguageId.value;
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

  const draftKey = computed(() => {
    if (!context.scope.value || elementId.value === null) return null;

    return [
      context.scope.value.projectId,
      context.scope.value.languageToId,
      context.scope.value.branchId ?? "main",
      elementId.value,
    ].join(":");
  });

  const stashDraftForCurrentScope = () => {
    if (!draftKey.value) return;
    draftCache.set(draftKey.value, translationValue.value);
  };

  const restoreDraftForCurrentScope = () => {
    if (!draftKey.value) {
      translationValue.value = "";
      return;
    }

    translationValue.value = draftCache.get(draftKey.value) ?? "";
  };

  const setCurrentElementContext = (
    selectedElement: typeof element.value | null,
  ) => {
    contextStore.currentElementContentNodeId =
      selectedElement?.primaryContentNodeId ?? undefined;
  };

  const resetDraftForElementChange = (targetElementId: number | null) => {
    stashDraftForCurrentScope();

    if (elementId.value === targetElementId) return;

    translationValue.value = "";
    sourceTokens.value = [];
    translationTokens.value = [];
  };

  const setElementContextForExternalWorkbench = (input: {
    elementId: number | null;
    primaryContentNodeId?: string | null;
    sourceLanguageId?: string | null;
  }) => {
    resetDraftForElementChange(input.elementId);
    elementId.value = input.elementId;
    selectedElementSnapshot.value = null;
    externalElementLanguageId.value = input.sourceLanguageId ?? null;
    contextStore.currentElementContentNodeId =
      input.primaryContentNodeId ?? undefined;
  };

  /**
   * Immediately select the target element if it is already cached locally.
   *
   * @param targetElementId - Target element ID
   * @returns - Whether the local cache was hit
   */
  const selectLoadedElement = (targetElementId: number): boolean => {
    for (const [pageIndex, rows] of elementStore.loadedPages.entries()) {
      const selected = rows.find((item) => item.id === targetElementId);

      if (!selected) continue;

      resetDraftForElementChange(targetElementId);
      contextStore.setCurrentPage(pageIndex + 1);
      setCurrentElementContext(selected);
      elementId.value = targetElementId;
      selectedElementSnapshot.value = selected;
      externalElementLanguageId.value = null;
      restoreDraftForCurrentScope();

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
        resetDraftForElementChange(null);
        elementId.value = null;
        selectedElementSnapshot.value = null;
        externalElementLanguageId.value = null;
        setCurrentElementContext(null);
        await navigate(buildEditorHref(context.scope.value, "empty"));
        return;
      }

      resetDraftForElementChange(first.id);
      elementId.value = first.id;
      selectedElementSnapshot.value = first;
      externalElementLanguageId.value = null;
      setCurrentElementContext(first);
      restoreDraftForCurrentScope();
      await navigate(buildEditorHref(context.scope.value, first.id));
      return;
    }

    contextStore.setCurrentPage(pageIndex + 1);
    const rows = await elementStore.loadPage(pageIndex);
    const selected = rows.find((item) => item.id === targetElementId) ?? null;
    resetDraftForElementChange(targetElementId);
    setCurrentElementContext(selected);
    elementId.value = targetElementId;
    selectedElementSnapshot.value = selected;
    externalElementLanguageId.value = null;
    restoreDraftForCurrentScope();
  };

  const toPage = async (page: number) => {
    if (!context.scope.value) return;

    contextStore.setCurrentPage(page);
    await elementStore.loadPage(page - 1);

    // Keep the current selection stable across page changes.
    // Pagination should only affect the sidebar list window.
    const target = elementId.value ?? "auto";

    if (context.scope.value) {
      const nextScope = {
        ...context.scope.value,
        page,
      };

      await navigate(buildEditorHref(nextScope, target));
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
    if (
      !elementId.value ||
      !context.languageToId.value ||
      !context.scope.value ||
      !writeCapabilityRefs.canWrite.value
    ) {
      return;
    }

    const currentElementId = elementId.value;
    const currentLanguageId = context.languageToId.value;

    elementStore.setElementPending(currentElementId, true);

    try {
      await orpc.translation.create({
        projectId: context.scope.value.projectId,
        branchId: context.scope.value.branchId,
        elementId: currentElementId,
        languageId: currentLanguageId,
        text: translationValue.value,
        createMemory: profile.editorMemoryAutoCreateMemory.value,
      });

      // Ensure the translation list updates even if the SSE event races.
      void queryCache.invalidateQueries({
        key: [
          "translations",
          currentElementId,
          currentLanguageId,
          context.scope.value.branchId ?? null,
        ],
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
    elementLanguageId: resolvedElementLanguageId,
    pageTotalAmount,
    setElementContextForExternalWorkbench,
    selectLoadedElement,
    toElement,
    toPage,
    toNextUntranslated,
    translate,
    replace,
    clear,
    insert,
    stashDraftForCurrentScope,
    restoreDraftForCurrentScope,
    redo,
    undo,
  };
});
