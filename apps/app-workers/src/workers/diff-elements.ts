import { defineTask } from "@/core";
import { createElementWorkflow } from "@/workers/create-element";
import { diffArraysAndSeparate } from "@cat/app-server-shared/utils";
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
import z from "zod";

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
          languageId: translatableString.languageId,
          sortIndex: translatableElement.sortIndex,
          translatableStringId: translatableElement.translatableStringId,
        })
        .from(translatableElement)
        .innerJoin(
          translatableString,
          eq(translatableElement.translatableStringId, translatableString.id),
        )
        .where(inArray(translatableElement.id, data.oldElementIds))
    ).map((element) => ({
      id: element.id,
      text: element.text,
      sortIndex: element.sortIndex ?? 0,
      languageId: element.languageId,
      meta: element.meta,
      translatableStringId: element.translatableStringId,
      documentId: data.documentId,
    }));

    // 2. 计算差异 (Added / Removed)
    // 注意：这里判定“相同”的标准仅是 value 和 meta，不包含 sortIndex
    const { added, removed } = diffArraysAndSeparate(
      oldElements,
      data.elementData,
      (a, b) => a.text === b.text && isEqual(a.meta, b.meta),
    );

    // 3. 删除移除的元素
    const removedElementIds = removed.map((el) => el.id);
    if (removedElementIds.length > 0) {
      await drizzle
        .delete(translatableElement)
        .where(inArray(translatableElement.id, removedElementIds));
    }

    // 4. [新增逻辑] 处理更新 (Updated)
    // 找出既没被移除（旧），也没被新增（新）的元素，这些是 intersection
    // 我们需要检查它们的 sortIndex 是否发生了变化
    const removedIdsSet = new Set(removedElementIds);
    const keptOldElements = oldElements.filter((e) => !removedIdsSet.has(e.id));

    const addedSet = new Set(added);
    const keptNewElements = data.elementData.filter((e) => !addedSet.has(e));

    // 为了高效匹配，将 keptNewElements 按 value 分组
    const newElementMap = new Map<string, typeof keptNewElements>();
    for (const el of keptNewElements) {
      if (!newElementMap.has(el.text)) {
        newElementMap.set(el.text, []);
      }
      newElementMap.get(el.text)!.push(el);
    }

    const updates: { id: number; sortIndex: number }[] = [];

    for (const oldEl of keptOldElements) {
      const candidates = newElementMap.get(oldEl.text);
      if (candidates) {
        // 在同 value 的新元素中找到 meta 匹配的一个
        const index = candidates.findIndex((c) => isEqual(c.meta, oldEl.meta));
        if (index !== -1) {
          const newEl = candidates[index];
          // 移除该候选项，防止重复匹配（应对重复内容的情况）
          candidates.splice(index, 1);

          // 核心检查：sortIndex 是否变动
          if (oldEl.sortIndex !== newEl.sortIndex) {
            updates.push({ id: oldEl.id, sortIndex: newEl.sortIndex });
          }
        }
      }
    }

    // 批量更新 sortIndex
    if (updates.length > 0) {
      const sqlChunks = [sql`(CASE`];
      const ids: number[] = [];
      for (const u of updates) {
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

    // 5. 处理新增元素
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

    // 6. 对无缓存的元素调用 CreateElementWorkflow
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

    return {
      addedElementIds: addedIds,
      removedElementIds,
      documentId: data.documentId,
    };
  },
});
