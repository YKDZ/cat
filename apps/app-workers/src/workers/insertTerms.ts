import {
  and,
  eq,
  getDrizzleDB,
  glossary,
  inArray,
  isNotNull,
  term,
  termEntry,
} from "@cat/db";
import {
  assertFirstNonNullish,
  assertSingleNonNullish,
} from "@cat/shared/utils";
import { TermDataSchema } from "@cat/shared/schema/misc";
import * as z from "zod/v4";
import { PluginRegistry } from "@cat/plugin-core";
import { createStringFromData } from "@cat/app-server-shared/utils";
import { defineWorker } from "@/utils";

const { client: drizzle } = await getDrizzleDB();

const id = "insert-term";

declare module "../core/registry" {
  interface WorkerInputTypeMap {
    [id]: InsertTermsInput;
  }
}

const InsertTermsInputSchema = z.object({
  glossaryId: z.uuidv7(),
  termsData: z.array(TermDataSchema),
  creatorId: z.uuidv7(),
});

type InsertTermsInput = z.infer<typeof InsertTermsInputSchema>;

const insertTermsWithTranslations = async (
  input: InsertTermsInput,
  pluginRegistry: PluginRegistry,
) => {
  const { glossaryId, termsData, creatorId } = input;

  const vStorage = assertFirstNonNullish(
    pluginRegistry.getPluginServices("VECTOR_STORAGE"),
  );
  const vizer = assertFirstNonNullish(
    pluginRegistry.getPluginServices("TEXT_VECTORIZER"),
  );

  const vectorStorageId = await pluginRegistry.getPluginServiceDbId(
    drizzle,
    vStorage.record,
  );
  const vectorizerId = await pluginRegistry.getPluginServiceDbId(
    drizzle,
    vizer.record,
  );

  await drizzle.transaction(async (tx) => {
    const termStringIds = await createStringFromData(
      tx,
      vizer.service,
      vectorizerId,
      vStorage.service,
      vectorStorageId,
      termsData.map((d) => ({
        value: d.term,
        languageId: d.termLanguageId,
      })),
    );

    const translationStringIds = await createStringFromData(
      tx,
      vizer.service,
      vectorizerId,
      vStorage.service,
      vectorStorageId,
      termsData.map((d) => ({
        value: d.translation,
        languageId: d.translationLanguageId,
      })),
    );

    const subjects = [
      ...new Set(
        termsData.map((d) => d.subject).filter((s): s is string => s !== null),
      ),
    ];

    const existingEntries = subjects.length
      ? await tx
          .select({
            id: termEntry.id,
            subject: termEntry.subject,
          })
          .from(termEntry)
          .where(
            and(
              eq(termEntry.glossaryId, glossaryId),
              inArray(termEntry.subject, subjects),
              isNotNull(termEntry.subject),
            ),
          )
      : [];

    const entryMap = new Map<string, number>();
    for (const e of existingEntries) {
      if (!e.subject)
        throw new Error(
          "Subject is null. This could not happen due to isNotNull constraint",
        );
      entryMap.set(e.subject, e.id);
    }

    const missingSubjects = subjects.filter((s) => !entryMap.has(s));

    if (missingSubjects.length > 0) {
      const insertedEntries = await tx
        .insert(termEntry)
        .values(
          missingSubjects.map((subject) => ({
            subject,
            glossaryId,
          })),
        )
        .returning({
          id: termEntry.id,
          subject: termEntry.subject,
        });

      for (const e of insertedEntries) {
        if (!e.subject)
          throw new Error(
            "Subject is null. This could not happen due to isNotNull constraint",
          );
        entryMap.set(e.subject, e.id);
      }
    }

    const termRows: {
      creatorId: string;
      stringId: number;
      termEntryId: number;
    }[] = [];

    for (let i = 0; i < termsData.length; i += 1) {
      const data = termsData[i];
      if (data.subject === null) continue;

      const entryId = entryMap.get(data.subject);
      if (!entryId) continue;

      termRows.push({
        creatorId,
        stringId: termStringIds[i],
        termEntryId: entryId,
      });

      termRows.push({
        creatorId,
        stringId: translationStringIds[i],
        termEntryId: entryId,
      });
    }

    if (termRows.length > 0) {
      await tx.insert(term).values(termRows);
    }
  });
};

const insertTermsWorker = defineWorker({
  id,
  inputSchema: InsertTermsInputSchema,

  async execute(ctx) {
    const { termsData, glossaryId } = ctx.input;

    if (termsData.length === 0) {
      return {
        termCount: 0,
        translationCount: 0,
      };
    }

    assertSingleNonNullish(
      await drizzle
        .select({ id: glossary.id })
        .from(glossary)
        .where(eq(glossary.id, glossaryId))
        .limit(1),
      `Glossary ${glossaryId} not found`,
    );

    await insertTermsWithTranslations(ctx.input, ctx.pluginRegistry);

    return {
      glossaryId,
    };
  },
});

export default {
  workers: { insertTermsWorker },
} as const;
