import { defineTask } from "@/core";
import { createStringFromData } from "@cat/app-server-shared/utils";
import {
  and,
  eq,
  getDrizzleDB,
  inArray,
  isNotNull,
  term,
  termEntry,
} from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import { TermDataSchema } from "@cat/shared/schema/misc";
import { assertFirstNonNullish } from "@cat/shared/utils";
import z from "zod";

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
    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    const vStorage = assertFirstNonNullish(
      pluginRegistry.getPluginServices("VECTOR_STORAGE"),
    );
    const vizer = assertFirstNonNullish(
      pluginRegistry.getPluginServices("TEXT_VECTORIZER"),
    );

    const vectorStorageId = await pluginRegistry.getPluginServiceDbId(
      drizzle,
      vStorage.record.pluginId,
      vStorage.record.id,
    );
    const vectorizerId = await pluginRegistry.getPluginServiceDbId(
      drizzle,
      vizer.record.pluginId,
      vizer.record.id,
    );

    // ... 复用原有的事务逻辑 ...
    const termIds = await drizzle.transaction(async (tx) => {
      // 1. 创建字符串
      const termStringIds = await createStringFromData(
        tx,
        vizer.service,
        vectorizerId,
        vStorage.service,
        vectorStorageId,
        data.data.map((d) => ({ text: d.term, languageId: d.termLanguageId })),
      );

      const translationStringIds = await createStringFromData(
        tx,
        vizer.service,
        vectorizerId,
        vStorage.service,
        vectorStorageId,
        data.data.map((d) => ({
          text: d.translation,
          languageId: d.translationLanguageId,
        })),
      );

      // 2. 处理 Subjects 和 Entry
      const subjects = [
        ...new Set(
          data.data
            .map((d) => d.subject)
            .filter((s): s is string => s !== null),
        ),
      ];

      // ... 获取现有 Entry ...
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

      // 3. 插入 Term
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
