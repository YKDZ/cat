import type { Language } from "@cat/shared/schema/drizzle/misc";
import { defineStore } from "pinia";
import { ref } from "vue";
import { trpc } from "@cat/app-api/trpc/client";

export const useLanguageStore = defineStore("language", () => {
  const languages = ref<Language[]>([]);

  const update = async () => {
    languages.value = await trpc.language.getAll.query();
  };

  return {
    languages,
    update,
  };
});
