import { defineStore, storeToRefs } from "pinia";
import { reactive, computed } from "vue";
import * as z from "zod/v4";
import {
  ElementTranslationStatusSchema,
  type ElementTranslationStatus,
} from "@cat/shared/schema/misc";
import { TranslatableElementSchema } from "@cat/shared/schema/drizzle/document";
import type { TranslatableElement } from "@cat/shared/schema/drizzle/document";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { orpc } from "@/server/orpc";

export const TranslatableElementWithDetailsSchema =
  TranslatableElementSchema.extend({
    value: z.string(),
    languageId: z.string(),
    status: ElementTranslationStatusSchema.default("NO"),
  });

type TranslatableElementWithDetails = z.infer<
  typeof TranslatableElementWithDetailsSchema
>;

export const useEditorElementStore = defineStore("editorElement", () => {
  const context = storeToRefs(useEditorContextStore());

  const loadedPages = reactive(
    new Map<number, TranslatableElementWithDetails[]>(),
  );
  const loadedPageHashes = reactive(new Map<number, string>());

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

  const getElementTranslationStatus = async (
    elementId: number,
  ): Promise<ElementTranslationStatus> => {
    if (!elementId || !context.languageToId.value) return "NO";

    return await orpc.document.getElementTranslationStatus({
      elementId,
      languageId: context.languageToId.value,
    });
  };

  const updateElement = (updatedElement: TranslatableElement) => {
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

  return {
    loadedPages,
    loadedPageHashes,
    loadedPagesIndex,
    storedElements,
    displayedElements,
    getElementTranslationStatus,
    updateElement,
    updateElementStatus,
    refresh,
  };
});
