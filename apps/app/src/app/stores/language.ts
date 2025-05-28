import { trpc } from "@/server/trpc/client";
import { Language } from "@cat/shared";
import { defineStore } from "pinia";
import { ref } from "vue";

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
