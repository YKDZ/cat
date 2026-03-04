import {
  alias,
  and,
  asc,
  document,
  eq,
  getDrizzleDB,
  gt,
  sql,
  translatableElement,
  translatableElementContext,
  translatableString,
  translation,
} from "@cat/db";
import {
  TranslatableElementContextSchema,
  type TranslatableElementContext,
} from "@cat/shared/schema/drizzle/document";
import { safeZDotJson } from "@cat/shared/schema/json";
import * as z from "zod";

import { defineTool } from "@/tools/types";

const DEFAULT_PAGE_SIZE = 20;

const InputSchema = z.object({
  projectId: z.uuidv4(),
  userId: z.uuidv4(),
  sourceLanguageId: z.string().optional(),
  translationLanguageId: z.string().optional(),
  /** Cursor: the translationId of the last item from the previous page. Omit for the first page. */
  cursor: z.int().positive().optional().meta({
    description:
      "Cursor for pagination. Pass the translationId of the last item from the previous page. Omit for the first page.",
  }),
  /** Number of items per page (default: 20, max: 32). */
  limit: z.int().min(1).max(32).default(DEFAULT_PAGE_SIZE),
});

const OutputSchema = z.object({
  translations: z.array(
    z.object({
      translationId: z.int(),
      element: z.string(),
      elementMeta: safeZDotJson,
      elementContexts: z.array(
        TranslatableElementContextSchema.pick({
          fileId: true,
          storageProviderId: true,
          type: true,
          jsonData: true,
          textData: true,
        }),
      ),
      translation: z.string(),
      sourceLanguageId: z.string(),
      translationLanguageId: z.string(),
      documentId: z.string(),
    }),
  ),
  /** Pass this value as `cursor` in the next request to fetch the next page. Null means no more pages. */
  nextCursor: z.number().nullable(),
  hasMore: z.boolean(),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

/**
 * Retrieve user's translation history with cursor-based pagination.
 * Returns a page of source texts and their translations, ordered by translation ID ascending.
 * Use `nextCursor` from the response as `cursor` in the next request to fetch subsequent pages.
 * Optionally filters by source and target language.
 */
const getUserTranslationHistoryOp = async (data: Input): Promise<Output> => {
  const { client: drizzle } = await getDrizzleDB();

  // Create aliases for translatableString table
  const sourceString = alias(translatableString, "sourceString");
  const translationString = alias(translatableString, "translationString");

  // Build filter conditions
  const conditions = [
    eq(document.projectId, data.projectId),
    eq(translation.translatorId, data.userId),
  ];

  if (data.sourceLanguageId) {
    conditions.push(eq(sourceString.languageId, data.sourceLanguageId));
  }

  if (data.translationLanguageId) {
    conditions.push(
      eq(translationString.languageId, data.translationLanguageId),
    );
  }

  // Apply cursor: only fetch records whose id > cursor
  if (data.cursor !== undefined) {
    conditions.push(gt(translation.id, data.cursor));
  }

  // Fetch one extra row to determine whether a next page exists
  const fetchLimit = data.limit + 1;

  const contextsSubquery = drizzle
    .select({
      elementId: translatableElementContext.translatableElementId,
      // Explicitly enumerate columns — getColumns() cannot be interpolated into
      // json_build_object() because it returns a plain Record<string, Column>
      // object, which Drizzle's sql template tag cannot expand as alternating
      // key/value pairs.
      contextsArray: sql<TranslatableElementContext[]>`json_agg(
        json_build_object(
          'type',                  ${translatableElementContext.type},
          'jsonData',              ${translatableElementContext.jsonData},
          'fileId',                ${translatableElementContext.fileId},
          'storageProviderId',     ${translatableElementContext.storageProviderId},
          'textData',              ${translatableElementContext.textData}
        )
      )`.as("contexts_array"),
    })
    .from(translatableElementContext)
    .groupBy(translatableElementContext.translatableElementId)
    .as("contexts_subquery");

  // Query translations with their source texts
  const rows = await drizzle
    .select({
      translationId: translation.id,
      element: sourceString.value,
      elementMeta: translatableElement.meta,
      translation: translationString.value,
      sourceLanguageId: sourceString.languageId,
      translationLanguageId: translationString.languageId,
      documentId: document.id,
      elementContexts: contextsSubquery.contextsArray,
    })
    .from(translation)
    .innerJoin(
      translatableElement,
      eq(translation.translatableElementId, translatableElement.id),
    )
    .innerJoin(
      sourceString,
      eq(translatableElement.translatableStringId, sourceString.id),
    )
    .leftJoin(
      contextsSubquery,
      eq(contextsSubquery.elementId, translatableElement.id),
    )
    .innerJoin(document, eq(translatableElement.documentId, document.id))
    .innerJoin(
      translationString,
      eq(translation.stringId, translationString.id),
    )
    .where(and(...conditions))
    .orderBy(asc(translation.id))
    .limit(fetchLimit);

  const hasNextPage = rows.length > data.limit;
  const pageRows = hasNextPage ? rows.slice(0, data.limit) : rows;
  const nextCursor = hasNextPage
    ? (pageRows[pageRows.length - 1]?.translationId ?? null)
    : null;

  return {
    translations: pageRows.map((r) => ({
      ...r,
    })),
    nextCursor,
    hasMore: hasNextPage,
  };
};

export const getUserTranslationHistoryTool = defineTool({
  name: "get_user_translation_history",
  description:
    "Retrieve user's translation history with cursor-based pagination. " +
    "Returns a page of source/translation pairs ordered by translation ID. " +
    "Pass the returned `nextCursor` as `cursor` in the next call to get the next page (null and hasMore = false means no more pages). " +
    "Optionally filters by source language and/or target language.",
  parameters: InputSchema,
  execute: async (args) => {
    return getUserTranslationHistoryOp(args);
  },
});
