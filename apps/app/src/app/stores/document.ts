import { trpc } from "@/server/trpc/client";
import type { Task } from "@cat/shared";
import { defineStore } from "pinia";
import { reactive, shallowReactive } from "vue";

export type TranslationCount = {
  languageId: string;
  translatedEleAmount: number;
  approvedTranslationAmount: number;
};

export const useDocumentStore = defineStore("document", () => {
  const translationAmounts = reactive(new Map<string, TranslationCount>());
  const translatableEleAmounts = reactive(new Map<string, number>());
  const tasks = shallowReactive(new Map<string, Task[]>());

  const updateTranslationAmount = async (id: string, languageId: string) => {
    const translatedEleAmount = await trpc.document.countElement.query({
      id,
      isTranslated: true,
    });

    const approvedTranslationAmount = await trpc.document.countElement.query({
      id,
      isTranslated: true,
      isApproved: true,
    });

    translationAmounts.set(id, {
      languageId,
      translatedEleAmount,
      approvedTranslationAmount,
    } satisfies TranslationCount);
  };

  const updateTranslatableEleAmount = async (id: string) => {
    await trpc.document.countElement
      .query({
        id,
      })
      .then((amount) => {
        translatableEleAmounts.set(id, amount);
      });
  };

  const updateDocumentFromFilePretreatmentTask = async (id: string) => {
    await trpc.document.queryTask
      .query({
        id,
        type: "document_from_file_pretreatment",
      })
      .then((task) => {
        if (!task) return;

        const documentTasks = tasks.get(id) ?? ([] as Task[]);
        documentTasks.push(task);

        tasks.set(id, documentTasks);
      });
  };

  return {
    translatableEleAmounts,
    translationAmounts,
    tasks,
    updateTranslatableEleAmount,
    updateTranslationAmount,
    updateDocumentFromFilePretreatmentTask,
  };
});
