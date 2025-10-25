import { defineStore, storeToRefs } from "pinia";
import { ref, computed, nextTick } from "vue";
import { trpc } from "@cat/app-api/trpc/client";
import * as z from "zod";
import { navigate } from "vike/client/router";
import { useRefHistory } from "@vueuse/core";
import { computedAsync } from "@vueuse/core";
import type { PartData } from "@/app/components/tagger/index.ts";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import {
  TranslatableElementWithDetailsSchema,
  useEditorElementStore,
} from "@/app/stores/editor/element.ts";
import { useProfileStore } from "@/app/stores/profile.ts";
import { hashJSON } from "@/app/utils/hash.ts";

export const useEditorTableStore = defineStore("editorTable", () => {
  const context = storeToRefs(useEditorContextStore());
  const elementStore = useEditorElementStore();
  const elementRefStore = storeToRefs(elementStore);
  const profile = storeToRefs(useProfileStore());

  const originDivEl = ref<HTMLDivElement>();
  const inputDivEl = ref<HTMLDivElement>();
  const inputTextareaEl = ref<HTMLTextAreaElement | null>(null);

  const elementId = ref<number | null>(null);
  const translationValue = ref<string>("");
  const sourceParts = ref<PartData[]>([]);
  const translationParts = ref<PartData[]>([]);
  const selectedTranslationId = ref<number | null>(null);
  const searchQuery = ref("");
  const isProofreading = ref(false);

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

  const elementTotalAmount = computedAsync(async () => {
    if (!context.documentId.value) return 0;

    return await trpc.document.countElement.query({
      documentId: context.documentId.value,
      searchQuery: searchQuery.value,
      isTranslated: !isProofreading.value ? undefined : true,
    });
  });

  const totalPageIndex = computed(() => {
    if (!elementTotalAmount.value) return 0;
    return Math.floor(elementTotalAmount.value / context.pageSize.value);
  });

  const toElement = async (id: number) => {
    if (!context.documentId.value) return;

    const page = await trpc.document.queryPageIndexOfElement.query({
      elementId: id,
      documentId: context.documentId.value,
      pageSize: context.pageSize.value,
      searchQuery: searchQuery.value,
      isTranslated: !isProofreading.value ? undefined : true,
    });
    await toPage(page);
    elementId.value = id;
    translationValue.value = "";
  };

  const toPage = async (index: number) => {
    if (!context.documentId.value) return;

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
      context.currentPageIndex.value = index;
      return;
    }

    await trpc.document.queryElements
      .query({
        documentId: context.documentId.value,
        page: index,
        pageSize: context.pageSize.value,
        searchQuery: searchQuery.value,
        isTranslated,
      })
      .then((elements) => {
        context.currentPageIndex.value = index;
        if (elements.length === 0) return;
        elementRefStore.loadedPages.value.set(
          index,
          z.array(TranslatableElementWithDetailsSchema).parse(elements),
        );
        elementRefStore.loadedPageHashes.value.set(index, inputHash);
      });
  };

  const toNextUntranslated = async () => {
    if (!context.documentId.value || !element.value) return;

    const firstUntranslatedElement =
      await trpc.document.queryFirstElement.query({
        documentId: context.documentId.value,
        greaterThan: element.value.sortIndex,
        isTranslated: false,
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

    if (!selectedTranslationId.value) {
      await trpc.translation.create.mutate({
        projectId: context.document.value.projectId,
        elementId: elementId.value,
        languageId: context.languageToId.value,
        value: translationValue.value,
        createMemory: profile.editorMemoryAutoCreateMemory.value,
      });
    } else {
      await trpc.translation.update.mutate({
        id: selectedTranslationId.value,
        value: translationValue.value,
      });
    }

    await elementStore.updateElementStatus(elementId.value);
  };

  const replace = (value: string) => {
    translationValue.value = value;
  };

  const clear = () => {
    translationValue.value = "";
  };

  const insert = async (value: string) => {
    if (!element.value || !inputTextareaEl.value) return;

    const start = inputTextareaEl.value.selectionStart;
    const end = inputTextareaEl.value.selectionEnd;

    translationValue.value =
      translationValue.value.slice(0, start) +
      value +
      translationValue.value.slice(end);

    await nextTick(() => {
      if (!inputTextareaEl.value) return;

      const position = start + value.length;
      inputTextareaEl.value.focus();
      inputTextareaEl.value.setSelectionRange(position, position);

      const event = new Event("input", { bubbles: true });
      inputTextareaEl.value.dispatchEvent(event);
    });
  };

  return {
    elementId,
    translationValue,
    originDivEl,
    inputDivEl,
    inputTextareaEl,
    sourceParts,
    translationParts,
    selectedTranslationId,
    searchQuery,
    isProofreading,
    element,
    elementTotalAmount,
    totalPageIndex,
    elementLanguageId,
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
