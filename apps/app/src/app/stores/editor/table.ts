import { defineStore, storeToRefs } from "pinia";
import { ref, computed, nextTick } from "vue";
import { orpc } from "@/server/orpc";
import * as z from "zod";
import { navigate } from "vike/client/router";
import { useRefHistory } from "@vueuse/core";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import {
  TranslatableElementWithDetailsSchema,
  useEditorElementStore,
} from "@/app/stores/editor/element.ts";
import { useProfileStore } from "@/app/stores/profile.ts";
import { hashJSON } from "@/app/utils/hash.ts";
import { useQuery } from "@pinia/colada";
import type { Token } from "@cat/plugin-core";

export const useEditorTableStore = defineStore("editorTable", () => {
  const context = storeToRefs(useEditorContextStore());
  const elementStore = useEditorElementStore();
  const elementRefStore = storeToRefs(elementStore);
  const profile = storeToRefs(useProfileStore());

  const inputDivEl = ref<HTMLDivElement>();
  const inputTextareaEl = ref<HTMLTextAreaElement | null>(null);

  const elementId = ref<number | null>(null);
  const translationValue = ref<string>("");
  const sourceTokens = ref<Token[]>([]);
  const translationTokens = ref<Token[]>([]);
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

    await orpc.translation.create({
      elementId: elementId.value,
      languageId: context.languageToId.value,
      text: translationValue.value,
      createMemory: profile.editorMemoryAutoCreateMemory.value,
    });

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
    inputDivEl,
    inputTextareaEl,
    sourceTokens,
    translationTokens,
    searchQuery,
    isProofreading,
    element,
    elementTotalAmount,
    elementLanguageId,
    pageTotalAmount,
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
