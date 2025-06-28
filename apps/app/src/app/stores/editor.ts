import { trpc } from "@/server/trpc/client";
import {
  TranslatableElementSchema,
  TranslationSchema,
  type Document,
  type ElementTranslationStatus,
  type MemorySuggestion,
  type TermRelation,
  type TranslatableElement,
  type TranslationSuggestion,
} from "@cat/shared";
import type { TRPCClientError } from "@trpc/client";
import { useRefHistory } from "@vueuse/core";
import { defineStore } from "pinia";
import { navigate } from "vike/client/router";
import { computed, nextTick, reactive, ref, shallowRef } from "vue";
import { useToastStore } from "./toast";
import type { PartData } from "../components/tagger";
import z from "zod/v4";

const TranslationStatusSchema = z
  .enum(["PROCESSING", "COMPLETED"])
  .default("COMPLETED");

const TranslationWithStatusSchema = TranslationSchema.extend({
  status: TranslationStatusSchema,
});

const TranslatableElementStatusSchema = z
  .enum(["NO", "TRANSLATED", "APPROVED"])
  .default("NO");

const TranslatableElementWithStatusSchema = TranslatableElementSchema.extend({
  status: TranslatableElementStatusSchema,
});

export type TranslatableElementWithStatus = z.infer<
  typeof TranslatableElementWithStatusSchema
>;

export type TranslationWithStatus = z.infer<typeof TranslationWithStatusSchema>;

export const useEditorStore = defineStore("editor", () => {
  const { trpcWarn } = useToastStore();

  // 分页与查询
  const elementTotalAmount = ref(0);
  const pageSize = ref(16);
  const currentPageIndex = ref(-1);
  const loadedPages = reactive(
    new Map<
      number,
      {
        elements: TranslatableElementWithStatus[];
      }
    >(),
  );
  const searchQuery = ref("");

  // 基本信息
  const documentId = ref<string | null>();
  const languageFromId = ref<string | null>(null);
  const languageToId = ref<string | null>(null);
  const translations = shallowRef<TranslationWithStatus[]>([]);
  const document = ref<Document | null>(null);
  const elementId = ref<number | null>(null);
  const translationValue = ref<string>("");
  const suggestions = ref<TranslationSuggestion[]>([]);
  const memories = ref<MemorySuggestion[]>([]);
  const terms = ref<TermRelation[]>([]);
  const originDivEl = ref<HTMLDivElement>();
  const inputDivEl = ref<HTMLDivElement>();
  const sourceParts = ref<PartData[]>([]);
  const translationParts = ref<PartData[]>([]);
  const selectedTranslationId = ref<number | null>(null);

  // 撤回重做
  const inputTextareaEl = ref<HTMLTextAreaElement | null>(null);
  const { undo, redo } = useRefHistory(translationValue);

  const totalPageIndex = computed<number>(() =>
    Math.floor(elementTotalAmount.value / pageSize.value),
  );

  // 审校模式
  const isProofreading = ref(false);

  const loadedPagesIndex = computed<number[]>(() => {
    return Array.from(loadedPages.keys());
  });

  const addTerms = (...termsToAdd: TermRelation[]) => {
    termsToAdd.forEach((relation) => {
      const { Term: term, Translation: translation } = relation;
      if (!term || !translation) return;
      const id =
        term.value +
        translation.value +
        term.creatorId +
        translation.creatorId +
        term.createdAt;
      if (
        !terms.value.find((relation: TermRelation) => {
          const { Term: t, Translation: tr } = relation;
          if (!t || !tr) return false;
          return (
            t.value + tr.value + t.creatorId + tr.creatorId + t.createdAt === id
          );
        })
      )
        terms.value.push(relation);
    });
  };

  const storedElements = computed<TranslatableElementWithStatus[]>(() => {
    // @ts-expect-error: Can not resolve type excessively deep
    return [...loadedPages.entries()]
      .sort((a, b) => a[0] - b[0])
      .flatMap(([, pageInfo]) => pageInfo.elements);
  });

  const displayedElements = computed<TranslatableElement[]>(() => {
    const info = loadedPages.get(currentPageIndex.value);
    if (!info) return [];
    return info.elements;
  });

  const toElement = async (id: number) => {
    if (!documentId.value) return;

    try {
      const page = await trpc.document.queryPageIndexOfElement.query({
        elementId: id,
        documentId: documentId.value,
        pageSize: pageSize.value,
        searchQuery: searchQuery.value,
        isTranslated: isProofreading.value === false ? undefined : true,
      });
      await toPage(page);
      elementId.value = id;
      translationValue.value = "";
    } catch (e) {
      trpcWarn(e as TRPCClientError<never>);
    }
  };

  const toPage = async (index: number) => {
    if (!documentId.value) return;
    if (loadedPagesIndex.value.includes(index)) {
      currentPageIndex.value = index;
      return;
    }

    await trpc.document.queryElements
      .query({
        documentId: documentId.value,
        page: index,
        pageSize: pageSize.value,
        searchQuery: searchQuery.value,
        isTranslated: isProofreading.value === false ? undefined : true,
      })
      .then((elements) => {
        currentPageIndex.value = index;

        if (elements.length === 0) return;

        loadedPages.set(currentPageIndex.value, {
          elements: z
            .array(TranslatableElementWithStatusSchema)
            .parse(elements),
        });
      });
  };

  const refresh = () => {
    elementTotalAmount.value = 0;
    currentPageIndex.value = -1;
    loadedPages.clear();
    terms.value = [];
    suggestions.value = [];
    translations.value = [];
    translationValue.value = "";
    memories.value = [];
  };

  const element = computed<TranslatableElementWithStatus | null>(() => {
    return (
      storedElements.value.find(
        (e: TranslatableElement) => e.id === elementId.value,
      ) ?? null
    );
  });

  const fetchTranslations = async (elementId: number) => {
    if (!elementId || !languageToId.value) return;

    await trpc.translation.queryAll
      .query({ elementId, languageId: languageToId.value })
      .then((newTranslations) => {
        translations.value = z
          .array(TranslationWithStatusSchema)
          .parse(newTranslations);
      });
  };

  const fetchDocument = async (id: string) => {
    documentId.value = id;

    await trpc.document.query
      .query({ id: documentId.value })
      .then((newDocument) => {
        document.value = newDocument;
      });

    await fetchElementTotalAmount();
  };

  const fetchElementTotalAmount = async () => {
    if (!documentId.value) return;

    await trpc.document.countElement
      .query({
        id: documentId.value,
        searchQuery: searchQuery.value,
        isTranslated: isProofreading.value === false ? undefined : true,
      })
      .then((amount) => {
        elementTotalAmount.value = amount;
      });
  };

  const handleNewTranslation = async (
    newTranslation: TranslationWithStatus,
    shouldUpsert: boolean = true,
  ) => {
    // 本地更新元素翻译状态
    if (
      element.value &&
      element.value.status !== "TRANSLATED" &&
      element.value.status !== "APPROVED"
    ) {
      element.value.status = "TRANSLATED";
    }

    if (shouldUpsert) upsertTranslation(newTranslation);
  };

  const jumpToNextUntranslated = async () => {
    if (!documentId.value) return;

    const lastPageIndex = Math.max(...Array.from(loadedPages.keys()));
    const lastPageElements = loadedPages.get(lastPageIndex)?.elements;

    if (!lastPageElements) return;

    const isAtLast =
      element.value?.id === lastPageElements[lastPageElements.length - 1].id;

    const currrentElementIndex = storedElements.value.findIndex(
      (el) => el.id == elementId.value,
    );

    let firstUntranslatedElement: TranslatableElement | null =
      storedElements.value.find(
        (element, index) =>
          (isAtLast || index > currrentElementIndex) && element.status === "NO",
      ) ?? null;

    if (!firstUntranslatedElement) {
      firstUntranslatedElement = await trpc.document.queryFirstElement.query({
        documentId: documentId.value,
        isTranslated: false,
      });
    }

    if (!firstUntranslatedElement) return;

    await toElement(firstUntranslatedElement.id);
    navigate(
      `/editor/${documentId.value}/${languageFromId.value}-${languageToId.value}/${firstUntranslatedElement.id}`,
    );
  };

  const translate = async (shouldInsert: boolean) => {
    if (!elementId.value || !languageToId.value || !document.value) return;

    if (!selectedTranslationId.value) {
      await trpc.translation.create
        .mutate({
          projectId: document.value.projectId,
          elementId: elementId.value,
          languageId: languageToId.value,
          value: translationValue.value,
        })
        .then((t) => {
          handleNewTranslation(t, shouldInsert);
        });
    } else {
      await trpc.translation.update
        .mutate({
          id: selectedTranslationId.value,
          value: translationValue.value,
        })
        .then((t) => {
          handleNewTranslation(
            TranslationWithStatusSchema.parse(t),
            shouldInsert,
          );
        });
    }
  };

  const queryElementTranslationStatus = async (
    elementId: number,
  ): Promise<ElementTranslationStatus> => {
    if (!elementId || !languageToId.value) return "NO";

    return await trpc.document.queryElementTranslationStatus.query({
      elementId,
      languageId: languageToId.value,
    });
  };

  const updateElement = (updatedElement: TranslatableElement) => {
    for (const [, pageInfo] of loadedPages.entries()) {
      const index = pageInfo.elements.findIndex(
        (el) => el.id === updatedElement.id,
      );

      if (index !== -1) {
        pageInfo.elements.splice(
          index,
          1,
          TranslatableElementWithStatusSchema.parse(updatedElement),
        );
        break;
      }
    }
  };

  const updateElementStatus = async (elementId: number) => {
    const status = await queryElementTranslationStatus(elementId);
    const element = storedElements.value.find((el) => el.id === elementId);

    if (!element) return;

    const newEl = TranslatableElementWithStatusSchema.parse({
      ...element,
      status,
    });

    updateElement(newEl);
  };

  const upsertTranslation = (translation: TranslationWithStatus) => {
    if (!translation) return;

    const currentIndex = translations.value.findIndex(
      (p) => p.id === translation.id,
    );
    if (currentIndex === -1) {
      translations.value.push(translation);
    } else {
      translations.value.splice(currentIndex, 1, translation);
    }

    translations.value = [...translations.value];
  };

  const replace = (value: string) => {
    translationValue.value = value;
  };

  const clear = () => {
    translationValue.value = "";
  };

  const insert = (value: string) => {
    if (!element.value || !inputTextareaEl.value) return;

    const start = inputTextareaEl.value.selectionStart;
    const end = inputTextareaEl.value.selectionEnd;

    translationValue.value =
      translationValue.value.slice(0, start) +
      value +
      translationValue.value.slice(end);

    nextTick(() => {
      if (!inputTextareaEl.value) return;

      const position = start + value.length;
      inputTextareaEl.value.focus();
      inputTextareaEl.value.setSelectionRange(position, position);

      const event = new Event("input", { bubbles: true });
      inputTextareaEl.value.dispatchEvent(event);
    });
  };

  return {
    storedElements,
    pageSize,
    elementTotalAmount,
    currentPageIndex,
    documentId,
    translations,
    document,
    languageFromId,
    languageToId,
    elementId,
    element,
    translationValue,
    displayedElements,
    suggestions,
    memories,
    inputTextareaEl,
    terms,
    selectedTranslationId,
    totalPageIndex,
    originDivEl,
    inputDivEl,
    searchQuery,
    sourceParts,
    translationParts,
    isProofreading,
    loadedPagesIndex,
    updateElementStatus,
    fetchElementTotalAmount,
    refresh,
    addTerms,
    jumpToNextUntranslated,
    toPage,
    toElement,
    undo,
    redo,
    fetchTranslations,
    fetchDocument,
    translate,
    upsertTranslation,
    replace,
    insert,
    clear,
    queryElementTranslationStatus,
  };
});
