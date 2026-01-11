import { defineTask } from "@/core";
import {
  createStringFromData,
  firstOrGivenService,
} from "@cat/app-server-shared/utils";
import {
  and,
  eq,
  getDrizzleDB,
  inArray,
  isNotNull,
  term,
  termEntry,
} from "@cat/db";
import { PluginManager } from "@cat/plugin-core";
import { TermDataSchema } from "@cat/shared/schema/misc";
import { logger } from "@cat/shared/utils";
import * as z from "zod";

export const CreateTermInputSchema = z.object({
  glossaryId: z.uuidv4(),
  creatorId: z.uuidv4().optional(),
  data: z.array(TermDataSchema),
});

export const CreateTermOutputSchema = z.object({
  termIds: z.array(z.int()),
});

export const createTermTask = await defineTask({
  name: "term.create",
  input: CreateTermInputSchema,
  output: CreateTermOutputSchema,

  handler: async (data) => {
    const { client: drizzle } = await getDrizzleDB();
    const pluginManager = PluginManager.get("GLOBAL", "");

    const vStorage = firstOrGivenService(pluginManager, "VECTOR_STORAGE");
    const vizer = firstOrGivenService(pluginManager, "TEXT_VECTORIZER");

    if (!vStorage || !vizer) {
      logger.warn("PROCESSOR", {
        msg: `No vector storage or text vectorizer service available. No term will be created`,
      });
      return {
        termIds: [],
      };
    }

    const termIds = await drizzle.transaction(async (tx) => {
      const termStringIds = await createStringFromData(
        tx,
        vizer.service,
        vizer.id,
        vStorage.service,
        vStorage.id,
        data.data.map((d) => ({ text: d.term, languageId: d.termLanguageId })),
      );

      const translationStringIds = await createStringFromData(
        tx,
        vizer.service,
        vizer.id,
        vStorage.service,
        vStorage.id,
        data.data.map((d) => ({
          text: d.translation,
          languageId: d.translationLanguageId,
        })),
      );

      const subjects = [
        ...new Set(
          data.data
            .map((d) => d.subject)
            .filter((s): s is string => s !== null),
        ),
      ];

      const existingEntries = subjects.length
        ? await tx
            .select({ id: termEntry.id, subject: termEntry.subject })
            .from(termEntry)
            .where(
              and(
                eq(termEntry.glossaryId, data.glossaryId),
                inArray(termEntry.subject, subjects),
                isNotNull(termEntry.subject),
              ),
            )
        : [];

      const entryMap = new Map<string, number>();
      existingEntries.forEach((e) => entryMap.set(e.subject!, e.id));

      const missingSubjects = subjects.filter((s) => !entryMap.has(s));

      if (missingSubjects.length > 0) {
        const inserted = await tx
          .insert(termEntry)
          .values(
            missingSubjects.map((subject) => ({
              subject,
              glossaryId: data.glossaryId,
            })),
          )
          .returning({ id: termEntry.id, subject: termEntry.subject });
        inserted.forEach((e) => entryMap.set(e.subject!, e.id));
      }

      const termRows = [];
      for (let i = 0; i < data.data.length; i += 1) {
        const item = data.data[i];
        if (!item.subject) continue;
        const entryId = entryMap.get(item.subject);
        if (!entryId) continue;

        termRows.push({
          creatorId: data.creatorId,
          stringId: termStringIds[i],
          termEntryId: entryId,
        });
        termRows.push({
          creatorId: data.creatorId,
          stringId: translationStringIds[i],
          termEntryId: entryId,
        });
      }

      if (termRows.length > 0) {
        const ids = await tx
          .insert(term)
          .values(termRows)
          .returning({ id: term.id });
        return ids.map((i) => i.id);
      }
      return [];
    });

    return { termIds };
  },
});
