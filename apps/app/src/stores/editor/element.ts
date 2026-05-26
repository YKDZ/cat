import type { EditorElement } from "@cat/shared";

import { EditorElementSchema } from "@cat/shared";
import {
  ElementTranslationStatusSchema,
  type ElementTranslationStatus,
} from "@cat/shared";
import { defineStore, storeToRefs } from "pinia";
import { reactive, computed } from "vue";
import * as z from "zod";

import { orpc } from "@/rpc/orpc";
import { useEditorContextStore } from "@/stores/editor/context.ts";
import { hashJSON } from "@/utils/hash.ts";

export const TranslatableElementWithDetailsSchema = EditorElementSchema.extend({
  status: ElementTranslationStatusSchema.default("NO"),
});

export type TranslatableElementWithDetails = EditorElement;

export const useEditorElementStore = defineStore("editorElement", () => {
  const context = storeToRefs(useEditorContextStore());

  const loadedPages = reactive(
    new Map<number, TranslatableElementWithDetails[]>(),
  );
  const loadedPageHashes = reactive(new Map<number, string>());
  const pendingElements = reactive(new Set<number>());

  const loadedPagesIndex = computed(() => {
    return Array.from(loadedPages.keys());
  });

  const storedElements = computed(() => {
    return [...loadedPages.entries()]
      .sort((a, b) => a[0] - b[0])
      .flatMap(([, elements]) => elements);
  });

  const displayedElements = computed(() => {
    const elements = loadedPages.get(context.currentPage.value - 1);
    if (!elements) return [];
    return elements;
  });

  const loadPage = async (
    page: number,
  ): Promise<TranslatableElementWithDetails[]> => {
    if (!context.scope.value) return [];

    const inputHash = await hashJSON({
      projectId: context.projectId.value,
      languageToId: context.languageToId.value,
      branchId: context.scope.value.branchId,
      contentNodeIds: context.contentNodeIds.value,
      searchQuery: context.searchQuery.value,
      statusFilter: context.statusFilter.value,
      sortMode: context.scope.value.sortMode,
      page,
      pageSize: context.pageSize.value,
    });

    if (loadedPageHashes.get(page) === inputHash) {
      return loadedPages.get(page) ?? [];
    }

    const elements = await orpc.editor.listElements({
      ...context.scope.value,
      page,
      pageSize: context.pageSize.value,
    });
    const parsed = z
      .array(TranslatableElementWithDetailsSchema)
      .parse(elements);

    loadedPages.set(page, parsed);
    loadedPageHashes.set(page, inputHash);

    return parsed;
  };

  const getElementTranslationStatus = async (
    elementId: number,
  ): Promise<ElementTranslationStatus> => {
    if (!elementId || !context.languageToId.value) return "NO";

    return await orpc.element.getTranslationStatus({
      elementId,
      languageId: context.languageToId.value,
      branchId: context.scope.value?.branchId,
    });
  };

  const setElementPending = (elementId: number, isPending: boolean) => {
    if (isPending) {
      pendingElements.add(elementId);
    } else {
      pendingElements.delete(elementId);
    }
  };

  const updateElement = (updatedElement: TranslatableElementWithDetails) => {
    for (const [page, elements] of loadedPages.entries()) {
      const index = elements.findIndex((el) => el.id === updatedElement.id);

      if (index === -1) continue;

      const parsed = TranslatableElementWithDetailsSchema.parse(updatedElement);

      elements.splice(index, 1, parsed);
      loadedPages.set(page, elements);

      return;
    }
  };

  const updateElementStatus = async (elementId: number) => {
    const element = storedElements.value.find((el) => el.id === elementId);

    if (!element) return;

    const status = await getElementTranslationStatus(elementId);

    const newEl = {
      ...element,
      status,
    };

    updateElement(newEl);
  };

  const refresh = () => {
    loadedPages.clear();
    loadedPageHashes.clear();
  };

  const clearAndLoadCurrentPage = async () => {
    refresh();
    if (context.currentPage.value >= 1) {
      await loadPage(context.currentPage.value - 1);
    }
  };

  return {
    loadedPages,
    loadedPageHashes,
    loadedPagesIndex,
    storedElements,
    displayedElements,
    pendingElements,
    setElementPending,
    getElementTranslationStatus,
    loadPage,
    clearAndLoadCurrentPage,
    updateElement,
    updateElementStatus,
    refresh,
  };
});
