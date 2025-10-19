import { trpc } from "@cat/app-api/trpc/client";
import {
  TranslationSchema,
  type TranslationApprovement,
} from "@cat/shared/schema/drizzle/translation";
import { defineStore, storeToRefs } from "pinia";
import { ref } from "vue";
import * as z from "zod";
import type { User } from "@cat/shared/schema/drizzle/user";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";

const TranslationStatusSchema = z
  .enum(["PROCESSING", "COMPLETED"])
  .default("COMPLETED");

const TranslationWithStatusSchema = TranslationSchema.extend({
  status: TranslationStatusSchema.optional(),
});

export type TranslationWithStatus = z.infer<typeof TranslationWithStatusSchema>;

export const useEditorTranslationStore = defineStore(
  "editorTranslation",
  () => {
    const table = storeToRefs(useEditorTableStore());
    const context = storeToRefs(useEditorContextStore());

    const translations = ref<
      (TranslationWithStatus & {
        Translator: User;
        TranslationApprovements: TranslationApprovement[];
      })[]
    >([]);

    const updateTranslations = async () => {
      if (!table.elementId.value || !context.languageToId.value) return;

      await trpc.translation.getAll
        .query({
          elementId: table.elementId.value,
          languageId: context.languageToId.value,
        })
        .then((newTranslations) => {
          // @ts-expect-error json optional
          translations.value = newTranslations;
        });
    };

    return {
      translations,
      updateTranslations,
    };
  },
);
