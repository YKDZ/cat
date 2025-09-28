import { defineStore, storeToRefs } from "pinia";
import { reactive, computed } from "vue";
import * as z from "zod/v4";
import type { ElementTranslationStatus } from "@cat/shared/schema/misc";
import { TranslatableElementSchema } from "@cat/shared/schema/prisma/document";
import type { TranslatableElement } from "@cat/shared/schema/prisma/document";
import { trpc } from "@cat/app-api/trpc/client";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";

const TranslatableElementStatusSchema = z
  .enum(["NO", "TRANSLATED", "APPROVED"])
  .default("NO");

export const TranslatableElementWithStatusSchema =
  TranslatableElementSchema.extend({
    status: TranslatableElementStatusSchema,
  });

type TranslatableElementWithStatus = z.infer<
  typeof TranslatableElementWithStatusSchema
>;

export const useEditorElementStore = defineStore("editorElement", () => {
  const context = storeToRefs(useEditorContextStore());

  const loadedPages = reactive(
    new Map<number, TranslatableElementWithStatus[]>(),
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
    const elements = loadedPages.get(context.currentPageIndex.value);
    if (!elements) return [];
    return elements;
  });

  const getElementTranslationStatus = async (
    elementId: number,
  ): Promise<ElementTranslationStatus> => {
    if (!elementId || !context.languageToId.value) return "NO";

    return await trpc.document.queryElementTranslationStatus.query({
      elementId,
      languageId: context.languageToId.value,
    });
  };

  const updateElement = (updatedElement: TranslatableElement) => {
    for (const [, elements] of loadedPages.entries()) {
      const index = elements.findIndex((el) => el.id === updatedElement.id);
      if (index === -1) continue;

      elements[index] =
        TranslatableElementWithStatusSchema.parse(updatedElement);
      return;
    }
  };

  const updateElementStatus = async (elementId: number) => {
    const element = storedElements.value.find((el) => el.id === elementId);

    if (!element) return;

    const status = await getElementTranslationStatus(elementId);

    const newEl = TranslatableElementWithStatusSchema.parse({
      ...element,
      status,
    });

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
