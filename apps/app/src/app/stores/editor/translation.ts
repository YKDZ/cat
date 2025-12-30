import { trpc } from "@cat/app-api/trpc/client";
import { defineStore, storeToRefs } from "pinia";
import { ref } from "vue";
import * as z from "zod";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { DrizzleDateTimeSchema } from "@cat/shared/schema/misc";
import { safeZDotJson } from "@cat/shared/schema/json";

const TranslationStatusSchema = z
  .enum(["PROCESSING", "COMPLETED"])
  .default("COMPLETED");

const TranslationWithStatusSchema = z.object({
  id: z.int(),
  text: z.string(),
  vote: z.int(),
  translatorId: z.uuidv4().nullable(),
  meta: safeZDotJson.optional(),
  createdAt: DrizzleDateTimeSchema,
  status: TranslationStatusSchema.optional(),
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
          translations.value = newTranslations;
        });
    };

    return {
      translations,
      updateTranslations,
    };
  },
);
