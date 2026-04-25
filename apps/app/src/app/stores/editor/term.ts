import type { RecallEvidence } from "@cat/shared";

import { defineStore, storeToRefs } from "pinia";
import { computed, ref } from "vue";

import { orpc } from "@/app/rpc/orpc";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";

import { useProfileStore } from "../profile";

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
  matchedText?: string;
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
  let abortController: AbortController | null = null;

  const updateTerms = async () => {
    if (abortController) {
      abortController.abort();
    }
    abortController = new AbortController();

    if (!elementId.value || !languageToId.value) return;

    try {
      const result = await orpc.glossary.findTerm(
        {
          elementId: elementId.value,
          translationLanguageId: languageToId.value,
          minConfidence: editorTermMinConfidence.value[0],
        },
        { signal: abortController.signal },
      );

      terms.value = [];

      for await (const term of result) {
        if (term) terms.value.push(term);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      throw err;
    }
  };

  const searchTerm = async () => {
    if (!elementLanguageId.value || !languageToId.value || !projectId.value)
      return 0;

    if (searchQuery.value.length === 0) return 0;

    let count = 0;

    const stream = await orpc.glossary.searchTerm({
      text: searchQuery.value,
      termLanguageId: elementLanguageId.value,
      translationLanguageId: languageToId.value,
      projectId: projectId.value,
    });

    for await (const t of stream) {
      if (t) {
        addTerms(t);
        count += 1;
      }
    }

    return count;
  };

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

      if (terms.value[existingIndex].confidence <= relation.confidence) {
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
    searchQuery,
    termDataList,
    updateTerms,
    addTerms,
    searchTerm,
  };
});
