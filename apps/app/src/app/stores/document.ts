import { trpc } from "@/server/trpc/client";
import type { Document, Task } from "@cat/shared";
import { defineStore } from "pinia";
import { shallowReactive, shallowRef } from "vue";

export type TranslationCount = {
  languageId: string;
  translatedEleAmount: number;
  approvedTranslationAmount: number;
};

export const useDocumentStore = defineStore("document", () => {
  const documents = shallowRef<Document[]>([]);
  const translationAmounts = shallowReactive(
    new Map<string, TranslationCount>(),
  );
  const translatableEleAmounts = shallowReactive(new Map<string, number>());
  const tasks = shallowReactive(new Map<string, Task[]>());

  const upsertDocuments = (...documentsToAdd: Document[]) => {
    for (const document of documentsToAdd) {
      if (!document) continue;

      const currentIndex = documents.value.findIndex(
        (p: Document) => p.id === document.id,
      );
      if (currentIndex === -1) {
        documents.value.push(document);
      } else {
        documents.value.splice(currentIndex, 1, document);
      }
    }
  };

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
    documents,
    translatableEleAmounts,
    translationAmounts,
    tasks,
    upsertDocuments,
    updateTranslatableEleAmount,
    updateTranslationAmount,
    updateDocumentFromFilePretreatmentTask,
  };
});
