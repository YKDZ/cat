import { trpc } from "@/server/trpc/client";
import type { Glossary } from "@cat/shared";
import { defineStore } from "pinia";
import { reactive, ref } from "vue";

export const useGlossaryStore = defineStore("glossary", () => {
  const glossaries = ref<Glossary[]>([]);
  const termAmounts = reactive(new Map<string, number>());

  const upsertGlossaries = (...glossariesToAdd: Glossary[]) => {
    for (const glossary of glossariesToAdd) {
      if (!glossary) continue;

      const currentIndex = glossaries.value.findIndex(
        (p: Glossary) => p.id === glossary.id,
      );
      if (currentIndex === -1) {
        glossaries.value.push(glossary);
      } else {
        glossaries.value.splice(currentIndex, 1, glossary);
      }
    }
  };

  const fetchGlossary = (id: string) => {
    trpc.glossary.query.query({ id }).then((glossary) => {
      if (glossary === null) return;
      upsertGlossaries(glossary);
    });
  };

  const updateTermAmount = async (id: string) => {
    await trpc.glossary.countTerm
      .query({
        id,
      })
      .then((amount) => {
        termAmounts.set(id, amount);
      });
  };

  return {
    glossaries,
    termAmounts,
    upsertGlossaries,
    fetchGlossary,
    updateTermAmount,
  };
});
