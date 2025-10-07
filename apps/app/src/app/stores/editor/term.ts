import { trpc } from "@cat/app-api/trpc/client";
import type { Term, TermRelation } from "@cat/shared/schema/prisma/glossary";
import { defineStore, storeToRefs } from "pinia";
import { ref } from "vue";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";

type TermRelationWithDetails = TermRelation & {
  Term: Term;
  Translation: Term;
};

export const useEditorTermStore = defineStore("editorTerm", () => {
  const { elementId, elementLanguageId } = storeToRefs(useEditorTableStore());
  const { languageToId } = storeToRefs(useEditorContextStore());

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
    if (!elementLanguageId.value || !languageToId.value) return 0;

    if (searchQuery.value.length === 0) return 0;

    const terms = await trpc.glossary.searchTerm.query({
      text: searchQuery.value,
      termLanguageId: elementLanguageId.value,
      translationLanguageId: languageToId.value,
    });

    addTerms(...terms);

    return terms.length;
  };

  const addTerms = (
    ...termsToAdd: (TermRelation & {
      Term: Term;
      Translation: Term;
    })[]
  ) => {
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

  return {
    terms,
    searchQuery,
    updateTerms,
    addTerms,
    searchTerm,
  };
});
