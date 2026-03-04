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

import type { OperationContext } from "@/operations/types";

import { createElementOp } from "@/operations/create-element";
import { createTranslatableStringOp } from "@/operations/create-translatable-string";

export const DiffElementsInputSchema = z.object({
  elementData: z.array(
    z.object({
      text: z.string(),
      sortIndex: z.int(),
      languageId: z.string(),
      meta: safeZDotJson,
      sourceStartLine: z.int().nullable().optional(),
      sourceEndLine: z.int().nullable().optional(),
      sourceLocationMeta: safeZDotJson.nullable().optional(),
    }),
  ),
  oldElementIds: z.array(z.int()),
  documentId: z.uuidv4(),
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
});

export const DiffElementsOutputSchema = z.object({
  addedElementIds: z.array(z.int()),
  removedElementIds: z.array(z.int()),
  documentId: z.uuidv4(),
});

export type DiffElementsInput = z.infer<typeof DiffElementsInputSchema>;
export type DiffElementsOutput = z.infer<typeof DiffElementsOutputSchema>;

/**
 * 比较新旧元素并执行增删改
 *
 * 1. 获取旧元素
 * 2. 通过 meta 匹配新旧元素
 * 3. 处理文本更新、排序更新、位置更新
 * 4. 创建新增元素
 * 5. 删除移除的元素
 */
export const diffElementsOp = async (
  data: DiffElementsInput,
  ctx?: OperationContext,
): Promise<DiffElementsOutput> => {
  const { client: drizzle } = await getDrizzleDB();

  // 1. 获取旧元素
  const oldElements = (
    await drizzle
      .select({
        id: translatableElement.id,
        text: translatableString.value,
        meta: translatableElement.meta,
        sortIndex: translatableElement.sortIndex,
        sourceStartLine: translatableElement.sourceStartLine,
        sourceEndLine: translatableElement.sourceEndLine,
        sourceLocationMeta: translatableElement.sourceLocationMeta,
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
    sourceStartLine: element.sourceStartLine,
    sourceEndLine: element.sourceEndLine,
    sourceLocationMeta: element.sourceLocationMeta,
  }));

  // 2. 通过 meta 匹配
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

  // 3. 识别更新
  const sortIndexUpdates: { id: number; sortIndex: number }[] = [];
  const textUpdates: { id: number; text: string; languageId: string }[] = [];
  const locationUpdates: {
    id: number;
    sourceStartLine: number | null;
    sourceEndLine: number | null;
    sourceLocationMeta: (typeof data.elementData)[number]["sourceLocationMeta"];
  }[] = [];

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
    const newStartLine = pair.new.sourceStartLine ?? null;
    const newEndLine = pair.new.sourceEndLine ?? null;
    const newLocMeta = pair.new.sourceLocationMeta ?? null;
    if (
      pair.old.sourceStartLine !== newStartLine ||
      pair.old.sourceEndLine !== newEndLine ||
      !isEqual(pair.old.sourceLocationMeta, newLocMeta)
    ) {
      locationUpdates.push({
        id: pair.old.id,
        sourceStartLine: newStartLine,
        sourceEndLine: newEndLine,
        sourceLocationMeta: newLocMeta,
      });
    }
  }

  // 4. 处理文本更新
  if (textUpdates.length > 0) {
    const { stringIds } = await createTranslatableStringOp(
      {
        data: textUpdates.map((u) => ({
          text: u.text,
          languageId: u.languageId,
        })),
        vectorizerId: data.vectorizerId,
        vectorStorageId: data.vectorStorageId,
      },
      ctx,
    );

    const sqlChunks = [sql`(CASE`];
    const ids: number[] = [];
    textUpdates.forEach((u, idx) => {
      const newStringId = stringIds[idx];
      sqlChunks.push(
        sql`WHEN ${translatableElement.id} = ${u.id} THEN ${newStringId}`,
      );
      ids.push(u.id);
    });
    sqlChunks.push(sql`ELSE ${translatableElement.translatableStringId} END)`);
    const finalSql = sql.join(sqlChunks, sql` `);

    await drizzle
      .update(translatableElement)
      .set({ translatableStringId: finalSql })
      .where(inArray(translatableElement.id, ids));
  }

  // 5. 处理 sortIndex 更新
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

  // 5.5. 处理 location 更新
  if (locationUpdates.length > 0) {
    const startLineChunks = [sql`(CASE`];
    const endLineChunks = [sql`(CASE`];
    const metaChunks = [sql`(CASE`];
    const ids: number[] = [];
    for (const u of locationUpdates) {
      startLineChunks.push(
        sql`WHEN ${translatableElement.id} = ${u.id} THEN ${u.sourceStartLine}`,
      );
      endLineChunks.push(
        sql`WHEN ${translatableElement.id} = ${u.id} THEN ${u.sourceEndLine}`,
      );
      metaChunks.push(
        sql`WHEN ${translatableElement.id} = ${u.id} THEN ${u.sourceLocationMeta ? sql`${JSON.stringify(u.sourceLocationMeta)}::jsonb` : sql`NULL`}`,
      );
      ids.push(u.id);
    }
    startLineChunks.push(sql`ELSE ${translatableElement.sourceStartLine} END)`);
    endLineChunks.push(sql`ELSE ${translatableElement.sourceEndLine} END)`);
    metaChunks.push(sql`ELSE ${translatableElement.sourceLocationMeta} END)`);

    await drizzle
      .update(translatableElement)
      .set({
        sourceStartLine: sql.join(startLineChunks, sql` `),
        sourceEndLine: sql.join(endLineChunks, sql` `),
        sourceLocationMeta: sql.join(metaChunks, sql` `),
      })
      .where(inArray(translatableElement.id, ids));
  }

  // 6. 处理新增元素
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
            translatableStringId: el.stringId,
            sourceStartLine: el.sourceStartLine ?? null,
            sourceEndLine: el.sourceEndLine ?? null,
            sourceLocationMeta: el.sourceLocationMeta ?? null,
          })),
        )
        .returning({ id: translatableElement.id });
      addedIds.push(...inserted.map((i) => i.id));
    }
  }

  // 7. 对无缓存的元素调用 createElementOp
  if (addedWithoutCache.length > 0) {
    const { elementIds } = await createElementOp(
      {
        data: addedWithoutCache.map((el) => ({
          documentId: data.documentId,
          text: el.text,
          languageId: el.languageId,
          sortIndex: el.sortIndex,
          meta: el.meta ?? {},
          sourceStartLine: el.sourceStartLine ?? null,
          sourceEndLine: el.sourceEndLine ?? null,
          sourceLocationMeta: el.sourceLocationMeta ?? null,
        })),
        vectorizerId: data.vectorizerId,
        vectorStorageId: data.vectorStorageId,
      },
      ctx,
    );

    addedIds.push(...elementIds);
  }

  // 8. 删除移除的元素
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
};
