import { safeZDotJson } from "@cat/shared";
import { DrizzleDateTimeSchema } from "@cat/shared";
import { useQuery, useQueryCache } from "@pinia/colada";
import { defineStore, storeToRefs } from "pinia";
import { watch } from "vue";
import * as z from "zod";

import { orpc } from "@/rpc/orpc";
import { useEditorContextStore } from "@/stores/editor/context.ts";
import { useEditorElementStore } from "@/stores/editor/element.ts";
import { useEditorTableStore } from "@/stores/editor/table.ts";
import { clientLogger as logger } from "@/utils/logger";

const MainTranslationWithStatusSchema = z.object({
  kind: z.literal("main").default("main"),
  id: z.int(),
  text: z.string(),
  vote: z.int(),
  translatorId: z.uuidv4().nullable(),
  meta: safeZDotJson.optional(),
  translatableElementId: z.int(),
  createdAt: DrizzleDateTimeSchema,
});

const BranchOverlayTranslationWithStatusSchema = z.object({
  kind: z.literal("branch-overlay"),
  overlayEntityId: z.string(),
  translatableElementId: z.int(),
  languageId: z.string(),
  text: z.string(),
  translatorId: z.uuidv4().nullable(),
  approved: z.boolean().default(false),
  vote: z.literal(0),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

const TranslationWithStatusSchema = z.discriminatedUnion("kind", [
  MainTranslationWithStatusSchema,
  BranchOverlayTranslationWithStatusSchema,
]);

export type TranslationWithStatus = z.infer<typeof TranslationWithStatusSchema>;

export const useEditorTranslationStore = defineStore(
  "editorTranslation",
  () => {
    const table = storeToRefs(useEditorTableStore());
    const context = storeToRefs(useEditorContextStore());
    const elementStore = useEditorElementStore();
    const queryCache = useQueryCache();

    const { state, refresh, refetch } = useQuery({
      key: () => [
        "translations",
        table.elementId.value,
        context.languageToId.value!,
        context.scope.value?.branchId ?? null,
      ],
      query: async () =>
        orpc.translation.getAll({
          elementId: table.elementId.value!,
          languageId: context.languageToId.value!,
          branchId: context.scope.value?.branchId,
        }),
      enabled: () =>
        !import.meta.env.SSR &&
        !!table.elementId.value &&
        !!context.languageToId.value,
    });

    let abortController: AbortController | null = null;
    watch(
      () => context.scope.value,
      async (scope) => {
        if (abortController) {
          abortController.abort();
          abortController = null;
        }

        if (!scope || import.meta.env.SSR) return;

        abortController = new AbortController();

        try {
          const stream = await orpc.translation.onCreate(scope, {
            signal: abortController.signal,
          });

          for await (const translation of stream) {
            const nextTranslation = MainTranslationWithStatusSchema.parse({
              kind: "main",
              ...translation,
            });

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
              scope.languageToId,
              scope.branchId ?? null,
            ];

            queryCache.setQueryData(
              queryKey,
              (old: TranslationWithStatus[] | undefined) => {
                if (!old) return [nextTranslation];
                if (
                  old.some(
                    (item) =>
                      item.kind === "main" && item.id === nextTranslation.id,
                  )
                ) {
                  return old;
                }
                return [...old, nextTranslation];
              },
            );
          }
        } catch (err) {
          logger
            .withSituation("WEB")
            .error(err, "Translation subscription error");
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
