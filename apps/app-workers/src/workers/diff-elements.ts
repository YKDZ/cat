import { defineTask } from "@/core";
import { createElementWorkflow } from "@/workers/create-element";
import { createTranslatableStringTask } from "@/workers/create-translatable-string";
import {
  eq,
  translatableString,
  translatableElement,
  getDrizzleDB,
  inArray,
  sql,
} from "@cat/db";
import { safeZDotJson } from "@cat/shared/schema/json";
import { isEqual } from "lodash-es";
import * as z from "zod";

export const DiffElementsInputSchema = z.object({
  elementData: z.array(
    z.object({
      text: z.string(),
      sortIndex: z.int(),
      languageId: z.string(),
      meta: safeZDotJson,
    }),
  ),
  oldElementIds: z.array(z.int()),
  documentId: z.uuidv4(),
  documentVersionId: z.int(),
});

export const DiffElementsOutputSchema = z.object({
  addedElementIds: z.array(z.number()),
  removedElementIds: z.array(z.number()),
  documentId: z.uuidv4(),
});

export const diffElementsTask = await defineTask({
  name: "element.diff",
  input: DiffElementsInputSchema,
  output: DiffElementsOutputSchema,

  handler: async (data, { traceId }) => {
    const { client: drizzle } = await getDrizzleDB();

    // 1. 获取旧元素
    const oldElements = (
      await drizzle
        .select({
          id: translatableElement.id,
          text: translatableString.value,
          meta: translatableElement.meta,
          sortIndex: translatableElement.sortIndex,
        })
        .from(translatableElement)
        .innerJoin(
          translatableString,
          eq(translatableElement.translatableStringId, translatableString.id),
        )
        .where(inArray(translatableElement.id, data.oldElementIds))
        .orderBy(translatableElement.sortIndex)
    ).map((element) => ({
      id: element.id,
      text: element.text,
      sortIndex: element.sortIndex ?? 0,
      meta: element.meta,
    }));

    // 2. Match elements by meta
    const oldElementsPool = [...oldElements];
    const added: (typeof data.elementData)[number][] = [];
    const matched: {
      old: (typeof oldElements)[number];
      new: (typeof data.elementData)[number];
    }[] = [];

    for (const newEl of data.elementData) {
      const matchIndex = oldElementsPool.findIndex((old) =>
        isEqual(old.meta, newEl.meta),
      );
      if (matchIndex !== -1) {
        matched.push({
          old: oldElementsPool[matchIndex],
          new: newEl,
        });
        oldElementsPool.splice(matchIndex, 1);
      } else {
        added.push(newEl);
      }
    }

    const removed = oldElementsPool;
    const removedElementIds = removed.map((e) => e.id);

    // 3. Identify updates
    const sortIndexUpdates: { id: number; sortIndex: number }[] = [];
    const textUpdates: { id: number; text: string; languageId: string }[] = [];

    for (const pair of matched) {
      if (pair.old.sortIndex !== pair.new.sortIndex) {
        sortIndexUpdates.push({
          id: pair.old.id,
          sortIndex: pair.new.sortIndex,
        });
      }
      if (pair.old.text !== pair.new.text) {
        textUpdates.push({
          id: pair.old.id,
          text: pair.new.text,
          languageId: pair.new.languageId,
        });
      }
    }

    // 4. Handle text updates
    if (textUpdates.length > 0) {
      const { result } = await createTranslatableStringTask.run(
        {
          data: textUpdates.map((u) => ({
            text: u.text,
            languageId: u.languageId,
          })),
        },
        { traceId },
      );
      const { stringIds } = await result();

      const sqlChunks = [sql`(CASE`];
      const ids: number[] = [];
      textUpdates.forEach((u, idx) => {
        const newStringId = stringIds[idx];
        sqlChunks.push(
          sql`WHEN ${translatableElement.id} = ${u.id} THEN ${newStringId}`,
        );
        ids.push(u.id);
      });
      sqlChunks.push(
        sql`ELSE ${translatableElement.translatableStringId} END)`,
      );
      const finalSql = sql.join(sqlChunks, sql` `);

      await drizzle
        .update(translatableElement)
        .set({ translatableStringId: finalSql })
        .where(inArray(translatableElement.id, ids));
    }

    // 5. Handle sortIndex updates
    if (sortIndexUpdates.length > 0) {
      const sqlChunks = [sql`(CASE`];
      const ids: number[] = [];
      for (const u of sortIndexUpdates) {
        sqlChunks.push(
          sql`WHEN ${translatableElement.id} = ${u.id} THEN ${u.sortIndex}`,
        );
        ids.push(u.id);
      }
      sqlChunks.push(sql`ELSE ${translatableElement.sortIndex} END)`);
      const finalSql = sql.join(sqlChunks, sql` `);

      await drizzle
        .update(translatableElement)
        .set({ sortIndex: finalSql })
        .where(inArray(translatableElement.id, ids));
    }

    // 6. Handle added elements
    const addedIds: number[] = [];
    const addedWithoutCache: typeof added = [];

    if (added.length > 0) {
      // 检查字符串缓存
      const tuples = added.map((el) => sql`(${el.text}, ${el.languageId})`);
      const existingStrings = await drizzle
        .select({
          id: translatableString.id,
          value: translatableString.value,
          languageId: translatableString.languageId,
        })
        .from(translatableString)
        .where(
          sql`(${translatableString.value}, ${translatableString.languageId}) in (${sql.join(tuples, sql`, `)})`,
        );

      const stringMap = new Map<string, number>();
      for (const str of existingStrings) {
        stringMap.set(`${str.value}|${str.languageId}`, str.id);
      }

      const addedWithCache: ((typeof added)[number] & { stringId: number })[] =
        [];

      for (const element of added) {
        const stringId = stringMap.get(`${element.text}|${element.languageId}`);
        if (stringId !== undefined) {
          addedWithCache.push({ ...element, stringId });
        } else {
          addedWithoutCache.push(element);
        }
      }

      // 直接插入有缓存的
      if (addedWithCache.length > 0) {
        const inserted = await drizzle
          .insert(translatableElement)
          .values(
            addedWithCache.map((el) => ({
              sortIndex: el.sortIndex,
              meta: el.meta,
              documentId: data.documentId,
              documentVersionId: data.documentVersionId,
              translatableStringId: el.stringId,
            })),
          )
          .returning({ id: translatableElement.id });
        addedIds.push(...inserted.map((i) => i.id));
      }
    }

    // 7. 对无缓存的元素调用 CreateElementWorkflow
    if (addedWithoutCache.length > 0) {
      const { result } = await createElementWorkflow.run(
        {
          data: addedWithoutCache.map((el) => ({
            documentId: data.documentId,
            documentVersionId: data.documentVersionId,
            text: el.text,
            languageId: el.languageId,
            sortIndex: el.sortIndex,
            meta: el.meta ?? {},
          })),
        },
        { traceId },
      );

      const { elementIds } = await result();

      addedIds.push(...elementIds);
    }

    // 8. 删除移除的元素 (最后执行，确保任务幂等性)
    if (removedElementIds.length > 0) {
      await drizzle
        .delete(translatableElement)
        .where(inArray(translatableElement.id, removedElementIds));
    }

    return {
      addedElementIds: addedIds,
      removedElementIds,
      documentId: data.documentId,
    };
  },
});
