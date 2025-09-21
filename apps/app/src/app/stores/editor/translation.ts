import { trpc } from "@cat/app-api/trpc/client";
import {
  TranslationApprovementSchema,
  TranslationSchema,
} from "@cat/shared/schema/prisma/translation";
import { defineStore, storeToRefs } from "pinia";
import { ref } from "vue";
import * as z from "zod";
import { UserSchema } from "@cat/shared/schema/prisma/user";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";

const TranslationStatusSchema = z
  .enum(["PROCESSING", "COMPLETED"])
  .default("COMPLETED");

const TranslationWithStatusSchema = TranslationSchema.extend({
  status: TranslationStatusSchema,

  Translator: UserSchema,
  Approvements: z.array(TranslationApprovementSchema),
});

export type TranslationWithStatus = z.infer<typeof TranslationWithStatusSchema>;

export const useEditorTranslationStore = defineStore(
  "editorTranslation",
  () => {
    const table = storeToRefs(useEditorTableStore());
    const context = storeToRefs(useEditorContextStore());

    const translations = ref<TranslationWithStatus[]>([]);

    const updateTranslations = async () => {
      if (!table.elementId.value || !context.languageToId.value) return;

      await trpc.translation.getAll
        .query({
          elementId: table.elementId.value,
          languageId: context.languageToId.value,
        })
        .then((newTranslations) => {
          translations.value = z
            .array(TranslationWithStatusSchema)
            .parse(newTranslations);
        });
    };

    return {
      translations,
      updateTranslations,
    };
  },
);
