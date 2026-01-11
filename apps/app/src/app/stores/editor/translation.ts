import { orpc } from "@/server/orpc";
import { defineStore, storeToRefs } from "pinia";
import * as z from "zod";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useEditorElementStore } from "@/app/stores/editor/element.ts";
import { DrizzleDateTimeSchema } from "@cat/shared/schema/misc";
import { safeZDotJson } from "@cat/shared/schema/json";
import { useQuery, useQueryCache } from "@pinia/colada";
import { watch } from "vue";
import { logger } from "@cat/shared/utils";

const TranslationWithStatusSchema = z.object({
  id: z.int(),
  text: z.string(),
  vote: z.int(),
  translatorId: z.uuidv4().nullable(),
  meta: safeZDotJson.optional(),
  translatableElementId: z.int(),
  createdAt: DrizzleDateTimeSchema,
});

export type TranslationWithStatus = z.infer<typeof TranslationWithStatusSchema>;

export const useEditorTranslationStore = defineStore(
  "editorTranslation",
  () => {
    const table = storeToRefs(useEditorTableStore());
    const context = storeToRefs(useEditorContextStore());
    const elementStore = useEditorElementStore();
    const queryCache = useQueryCache();

    const { state, refresh, refetch } = useQuery({
      key: ["translations", table.elementId.value, context.languageToId.value!],
      query: async () =>
        orpc.translation.getAll({
          elementId: table.elementId.value!,
          languageId: context.languageToId.value!,
        }),
      enabled: !import.meta.env.SSR,
    });

    let abortController: AbortController | null = null;
    watch(
      () => context.documentId.value,
      async (documentId) => {
        if (abortController) {
          abortController.abort();
          abortController = null;
        }

        if (!documentId || import.meta.env.SSR) return;

        abortController = new AbortController();

        try {
          const stream = await orpc.translation.onCreate(
            { documentId },
            { signal: abortController.signal },
          );

          for await (const translation of stream) {
            elementStore.setElementPending(
              translation.translatableElementId,
              false,
            );

            await elementStore.updateElementStatus(
              translation.translatableElementId,
            );

            const queryKey = [
              "translations",
              translation.translatableElementId,
              context.languageToId.value!,
            ];

            const cached = queryCache.getQueryData(queryKey);

            if (cached) {
              queryCache.setQueryData(
                queryKey,
                (old: TranslationWithStatus[] | undefined) => {
                  if (!old) return [translation];
                  if (old.some((t) => t.id === translation.id)) return old;
                  return [...old, translation];
                },
              );
            }
          }
        } catch (err) {
          logger.error("WEB", { msg: "Translation subscription error" }, err);
        }
      },
      { immediate: true },
    );

    return {
      state,
      refresh,
      refetch,
    };
  },
);
