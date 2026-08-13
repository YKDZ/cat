import {
  TermMatchSchema,
  TermRecallResultSchema,
  TermRecallStreamEventSchema,
  type TermRecallResult,
  type RecallEvidence,
} from "@cat/shared";
import { defineStore, storeToRefs } from "pinia";
import { computed, ref } from "vue";

import { orpc } from "#/rpc/orpc.ts";
import { useEditorContextStore } from "#/stores/editor/context.ts";
import { useEditorTableStore } from "#/stores/editor/table.ts";
import {
  createTrackedRequest,
  type TrackedRequest,
} from "#/utils/request-cancellation.ts";

import { useProfileStore } from "../profile.ts";

type TermRelationWithDetails = {
  term: string;
  translation: string;
  definition: string | null;
  confidence: number;
  termLanguageId: string;
  translationLanguageId: string;
  conceptId?: number;
  glossaryId?: string;
  evidences?: RecallEvidence[];
  matchedText?: string | undefined;
  concept?: {
    subjects: Array<{ name: string; defaultDefinition: string | null }>;
    definition?: string | null;
  };
};

export const useEditorTermStore = defineStore("editorTerm", () => {
  const { elementId, elementLanguageId } = storeToRefs(useEditorTableStore());
  const { languageToId, projectId } = storeToRefs(useEditorContextStore());
  const { editorTermMinConfidence } = storeToRefs(useProfileStore());

  const searchQuery = ref("");
  const terms = ref<TermRelationWithDetails[]>([]);
  const recallResult = ref<TermRecallResult | null>(null);
  const error = ref<string | null>(null);
  let activeRequest: TrackedRequest | null = null;

  const updateTerms = async () => {
    error.value = null;

    const requestedElementId = elementId.value;
    const requestedLanguageId = languageToId.value;
    const requestedElementLanguageId = elementLanguageId.value;
    if (
      !requestedElementId ||
      !requestedLanguageId ||
      !requestedElementLanguageId
    )
      return;

    activeRequest?.cancel();
    const request = createTrackedRequest();
    activeRequest = request;
    recallResult.value = null;

    try {
      const result = await orpc.glossary.findTerm(
        {
          elementId: requestedElementId,
          translationLanguageId: requestedLanguageId,
          minConfidence: editorTermMinConfidence.value[0],
        },
        { signal: request.signal },
      );

      if (activeRequest !== request) return;
      terms.value = [];

      for await (const rawEvent of result) {
        if (activeRequest !== request) return;
        const event = TermRecallStreamEventSchema.parse(rawEvent);
        if (event.type === "COMPLETED") {
          recallResult.value = TermRecallResultSchema.parse(event.result);
          continue;
        }
        terms.value.push({
          ...TermMatchSchema.parse(event.candidate),
          termLanguageId: requestedElementLanguageId,
          translationLanguageId: requestedLanguageId,
        });
      }
    } catch (err) {
      if (activeRequest !== request) return;
      if (
        request.signal.aborted ||
        (err instanceof Error && err.name === "AbortError")
      ) {
        return;
      }
      terms.value = [];
      error.value = err instanceof Error ? err.message : "unknown-error";
    } finally {
      if (activeRequest === request) activeRequest = null;
    }
  };

  const searchTerm = async () => {
    if (!elementLanguageId.value || !languageToId.value || !projectId.value)
      return 0;

    if (searchQuery.value.length === 0) return 0;

    let count = 0;
    recallResult.value = null;

    const stream = await orpc.glossary.searchTerm({
      text: searchQuery.value,
      termLanguageId: elementLanguageId.value,
      translationLanguageId: languageToId.value,
      projectId: projectId.value,
    });

    for await (const rawEvent of stream) {
      const event = TermRecallStreamEventSchema.parse(rawEvent);
      if (event.type === "COMPLETED") {
        recallResult.value = TermRecallResultSchema.parse(event.result);
        continue;
      }
      const term = TermMatchSchema.parse(event.candidate);
      addTerms({
        ...term,
        termLanguageId: elementLanguageId.value,
        translationLanguageId: languageToId.value,
      });
      count += 1;
    }

    return count;
  };

  const unsubscribe = (): void => {
    activeRequest?.cancel();
    activeRequest = null;
  };

  if (!import.meta.env.SSR) {
    const dispose = (): void => unsubscribe();
    window.addEventListener("beforeunload", dispose, { once: true });
  }

  const addTerms = (...termsToAdd: TermRelationWithDetails[]) => {
    termsToAdd.forEach((relation) => {
      const { term, translation } = relation;
      if (!term || !translation) return;
      const existingIndex = terms.value.findIndex((current) =>
        relation.conceptId !== undefined && current.conceptId !== undefined
          ? current.conceptId === relation.conceptId
          : current.term === relation.term &&
            current.translation === relation.translation,
      );

      if (existingIndex === -1) {
        terms.value.push(relation);
        return;
      }

      const existing = terms.value[existingIndex];
      if (
        existing !== undefined &&
        existing.confidence <= relation.confidence
      ) {
        terms.value.splice(existingIndex, 1, relation);
      }
    });
  };

  const termDataList = computed(() => {
    return terms.value.map((term) => ({
      term: term.term,
      termLanguageId: term.termLanguageId,
      translation: term.translation,
      translationLanguageId: term.translationLanguageId,
    }));
  });

  return {
    terms,
    recallResult,
    error,
    searchQuery,
    termDataList,
    updateTerms,
    addTerms,
    searchTerm,
    unsubscribe,
  };
});
