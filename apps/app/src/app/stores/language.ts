import type { Language } from "@cat/shared/schema/prisma/misc";
import { defineStore } from "pinia";
import { ref } from "vue";
import { trpc } from "@cat/app-api/trpc/client";

export const useLanguageStore = defineStore("language", () => {
  const languages = ref<Language[]>([]);

  const update = async () => {
    trpc.language.listAll.query().then((langs) => (languages.value = langs));
  };

  return {
    languages,
    update,
  };
});
