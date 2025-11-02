import { trpc } from "@cat/app-api/trpc/client";
import { defineStore, storeToRefs } from "pinia";
import { ref } from "vue";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";

type TermRelationWithDetails = {
  term: string;
  translation: string;
  termLanguageId: string;
  translationLanguageId: string;
};

export const useEditorTermStore = defineStore("editorTerm", () => {
  const { elementId, elementLanguageId } = storeToRefs(useEditorTableStore());
  const { languageToId, projectId } = storeToRefs(useEditorContextStore());

  const searchQuery = ref("");
  const terms = ref<TermRelationWithDetails[]>([]);

  const updateTerms = async () => {
    if (!elementId.value || !languageToId.value) return;

    terms.value = await trpc.glossary.findTerm.query({
      elementId: elementId.value,
      translationLanguageId: languageToId.value,
    });
  };

  const searchTerm = async () => {
    if (!elementLanguageId.value || !languageToId.value || !projectId.value)
      return 0;

    if (searchQuery.value.length === 0) return 0;

    const terms = await trpc.glossary.searchTerm.query({
      text: searchQuery.value,
      termLanguageId: elementLanguageId.value,
      translationLanguageId: languageToId.value,
      projectId: projectId.value,
    });

    addTerms(...terms);

    return terms.length;
  };

  const addTerms = (...termsToAdd: TermRelationWithDetails[]) => {
    termsToAdd.forEach((relation) => {
      const { term, translation } = relation;
      if (!term || !translation) return;
      const id = term + translation;
      if (
        !terms.value.find((relation) => {
          const { term: t, translation: tr } = relation;
          if (!t || !tr) return false;
          return t + tr === id;
        })
      )
        terms.value.push(relation);
    });
  };

  return {
    terms,
    searchQuery,
    updateTerms,
    addTerms,
    searchTerm,
  };
});
