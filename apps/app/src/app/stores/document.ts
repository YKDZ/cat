import { trpc } from "@/server/trpc/client";
import { defineStore } from "pinia";

export const useDocumentStore = defineStore("document", () => {
  const fetchTranslatedElementAmount = async (
    id: string,
    languageId: string,
    isApproved?: boolean,
  ) => {
    if (isApproved !== undefined)
      return await trpc.document.countTranslatedElementWithApprove.query({
        id,
        languageId,
        isApproved,
      });
    else
      return await trpc.document.countTranslatedElement.query({
        id,
        languageId,
      });
  };

  return {
    fetchTranslatedElementAmount,
  };
});
