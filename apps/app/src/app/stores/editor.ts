import { trpc } from "@/server/trpc/client";
import {
  Document,
  ElementTranslationStatus,
  MemorySuggestion,
  TermRelation,
  TranslatableElement,
  Translation,
  TranslationSuggestion,
} from "@cat/shared";
import { TRPCClientError } from "@trpc/client";
import { defineStore } from "pinia";
import { navigate } from "vike/client/router";
import { computed, nextTick, reactive, ref, watch } from "vue";
import { PartData } from "../components/formater";
import { useToastStore } from "./toast";
import { useUserStore } from "./user";
import { z } from "zod/v4";

export const useEditorStore = defineStore("editor", () => {
  const { warn, trpcWarn } = useToastStore();

  // 分页与查询
  const elementTotalAmount = ref(0);
  const pageSize = ref(16);
  const storedElements = ref<TranslatableElement[]>([]);
  const currentPageIndex = ref(-1);
  const loadedPages = ref<number[]>([]);
  const loadedPagesInfo = reactive(
    new Map<number, { fromId: number; toId: number }>(),
  );
  const searchQuery = ref("");

  // 基本信息
  const documentId = ref<string | null>();
  const languageFromId = ref<string | null>(null);
  const languageToId = ref<string | null>(null);
  const translations = ref<Translation[]>([]);
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

  // 撤回重做
  const inputTextareaEl = ref<HTMLTextAreaElement | null>(null);
  const undoStack = ref<
    {
      from: string;
      to: string;
    }[]
  >([]);
  const undoing = ref(false);

  const totalPageIndex = computed(() =>
    Math.floor(elementTotalAmount.value / pageSize.value),
  );

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
        !terms.value.find((relation) => {
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

  const addElements = (...elements: TranslatableElement[]) => {
    const seen = new Set<number>(storedElements.value.map((e) => e.id));
    elements.forEach((element) => {
      if (seen.has(element.id)) return;
      seen.add(element.id);
      storedElements.value.push(element);
    });
    storedElements.value.sort((a, b) => a.id - b.id);
  };

  const toElement = async (id: number) => {
    if (!documentId.value) return;

    try {
      const page = await trpc.document.queryPageIndexOfElement.query({
        id,
        documentId: documentId.value,
        pageSize: pageSize.value,
        searchQuery: searchQuery.value,
      });
      await toPage(page);
      elementId.value = id;
    } catch (e) {
      trpcWarn(e as TRPCClientError<never>);
    }
  };

  const toPage = async (index: number) => {
    if (!documentId.value) return;
    if (loadedPages.value.includes(index)) {
      currentPageIndex.value = index;
      return;
    }

    await trpc.document.queryElements
      .query({
        documentId: documentId.value,
        page: index,
        pageSize: pageSize.value,
        searchQuery: searchQuery.value,
      })
      .then((elements) => {
        currentPageIndex.value = index;

        if (elements.length === 0) return;

        loadedPagesInfo.set(currentPageIndex.value, {
          fromId: elements[0].id,
          toId: elements[elements.length - 1].id,
        });

        addElements(...elements);
        loadedPages.value.push(currentPageIndex.value);
      });
  };

  const refresh = () => {
    elementTotalAmount.value = 0;
    currentPageIndex.value = -1;
    loadedPages.value = [];
    loadedPagesInfo.clear();
    storedElements.value = [];
    terms.value = [];
    suggestions.value = [];
    translations.value = [];
    translationValue.value = "";
    memories.value = [];
  };

  const element = computed(
    () =>
      storedElements.value.find((element) => element.id === elementId.value) ??
      null,
  );

  const displayedElements = computed(() => {
    if (!storedElements.value) return [];

    const info = loadedPagesInfo.get(currentPageIndex.value);

    if (!info) return [];

    const start = storedElements.value.findIndex(
      (element) => element.id >= info.fromId,
    );
    const end =
      storedElements.value.length -
      [...storedElements.value]
        .reverse()
        .findIndex((element) => element.id <= info.toId);

    return storedElements.value.slice(start, end);
  });

  const fetchTranslations = async (elementId: number) => {
    if (!elementId || !languageToId.value) return;

    await trpc.translation.queryAll
      .query({ elementId, languageId: languageToId.value })
      .then((newTranslations) => {
        translations.value = newTranslations;
        translationValue.value = selfTranslation.value?.value ?? "";
      });
  };

  const selfTranslation = computed(() => {
    const { user } = useUserStore();

    if (!user || !translations.value) return null;

    return (
      translations.value.find((translation: { translatorId: string }) => {
        return translation.translatorId === user.id;
      }) ?? null
    );
  });

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

    await trpc.document.queryElementTotalAmount
      .query({ id: documentId.value, searchQuery: searchQuery.value })
      .then((amount) => {
        elementTotalAmount.value = amount;
      });
  };

  const handleNewTranslation = async (newTranslation: Translation) => {
    // 本地更新元素翻译状态
    if (
      element.value &&
      element.value?.status !== "TRANSLATED" &&
      element.value?.status !== "APPROVED"
    ) {
      element.value.status = "TRANSLATED";
    }

    updateOrInsertTranslation(newTranslation);
  };

  const jumpToNextUntranslated = async () => {
    if (!documentId.value) return;

    const isAtLast =
      element.value?.id ===
      storedElements.value[storedElements.value.length - 1].id;
    let firstUntranslatedElement: TranslatableElement | null =
      storedElements.value.find((el) => {
        if (!element.value) return false;
        return el.status === "NO" && (isAtLast || element.value.id < el.id);
      }) ?? null;
    if (!firstUntranslatedElement) {
      firstUntranslatedElement =
        await trpc.document.queryFirstUntranslatedElement.query({
          id: documentId.value,
          idGreaterThan: element.value?.id,
        });
    }

    if (!firstUntranslatedElement) return;

    await toElement(firstUntranslatedElement.id);
    navigate(
      `/editor/${documentId.value}/${languageFromId.value}-${languageToId.value}/${firstUntranslatedElement.id}`,
    );
  };

  const translate = async () => {
    if (!elementId.value || !languageToId.value || !document.value) return;
    // 不做无意义的更新
    if (selfTranslation.value?.value === translationValue.value) return;

    if (!selfTranslation.value) {
      await trpc.translation.create
        .mutate({
          projectId: document.value.projectId,
          elementId: elementId.value,
          languageId: languageToId.value,
          value: translationValue.value,
        })
        .then(handleNewTranslation);
    } else {
      await trpc.translation.update
        .mutate({
          id: selfTranslation.value.id,
          value: translationValue.value,
        })
        .then(handleNewTranslation);
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

  const updateOrInsertTranslation = (translation: Translation) => {
    const index = translations.value.findIndex(
      (item) => item.id === translation.id,
    );

    if (index === -1) {
      translations.value = [...translations.value, translation];
      return;
    }

    translations.value = translations.value.map((item, i) =>
      i === index ? translation : item,
    );
  };

  const replace = (value: string) => {
    translationValue.value = value;
  };

  const clear = () => {
    translationValue.value = "";
  };

  watch(translationValue, (to, from) => {
    if (undoing.value === true) {
      undoing.value = false;
      return;
    }

    undoStack.value.push({
      from,
      to,
    });
  });

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

  const undo = () => {
    const lastAction = undoStack.value.pop();
    if (!lastAction) return;

    undoing.value = true;
    translationValue.value = lastAction.from;
  };

  return {
    storedElements,
    pageSize,
    elementTotalAmount,
    currentPageIndex,
    documentId,
    translations,
    selfTranslation,
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
    totalPageIndex,
    originDivEl,
    inputDivEl,
    searchQuery,
    sourceParts,
    translationParts,
    fetchElementTotalAmount,
    refresh,
    addTerms,
    jumpToNextUntranslated,
    toPage,
    toElement,
    undo,
    fetchTranslations,
    fetchDocument,
    translate,
    updateOrInsertTranslation,
    replace,
    insert,
    clear,
    queryElementTranslationStatus,
  };
});
