import type { OperationContext } from "@cat/domain";

import { getDbHandle } from "@cat/domain";
import {
  bulkUpdateElementsForDiff,
  createElements,
  deleteElementsByIds,
  executeCommand,
  executeQuery,
  listCachedTranslatableStrings,
  listElementsForDiff,
} from "@cat/domain";
import { safeZDotJson } from "@cat/shared/schema/json";
import { isDeepStrictEqual } from "node:util";
import * as z from "zod";

import { createElementOp } from "./create-element";
import { createTranslatableStringOp } from "./create-translatable-string";

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
 * @zh 比较新旧元素并执行增删改。
 *
 * 1. 获取旧元素
 * 2. 通过 meta 匹配新旧元素
 * 3. 处理文本更新、排序更新、位置更新
 * 4. 创建新增元素
 * 5. 删除移除的元素
 * @en Compare old and new elements and apply additions, deletions, and updates.
 *
 * 1. Fetch old elements
 * 2. Match old and new elements by meta
 * 3. Process text updates, sort-index updates, and position updates
 * 4. Create newly added elements
 * 5. Delete removed elements
 *
 * @param data - {@zh 布丁输入参数} {@en Diff input parameters}
 * @param ctx - {@zh 操作上下文} {@en Operation context}
 * @returns - {@zh 新增元素 ID、移除元素 ID 及文档 ID} {@en IDs of added elements, removed elements, and the document}
 */
export const diffElementsOp = async (
  data: DiffElementsInput,
  ctx?: OperationContext,
): Promise<DiffElementsOutput> => {
  const { client: drizzle } = await getDbHandle();

  // 1. 获取旧元素
  const oldElements = (
    await executeQuery({ db: drizzle }, listElementsForDiff, {
      elementIds: data.oldElementIds,
    })
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
      isDeepStrictEqual(old.meta, newEl.meta),
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
      !isDeepStrictEqual(pair.old.sourceLocationMeta, newLocMeta)
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

    await executeCommand({ db: drizzle }, bulkUpdateElementsForDiff, {
      stringIdUpdates: textUpdates.map((update, index) => ({
        id: update.id,
        stringId: stringIds[index],
      })),
    });
  }

  // 5. 处理 sortIndex 更新
  if (sortIndexUpdates.length > 0 || locationUpdates.length > 0) {
    await executeCommand({ db: drizzle }, bulkUpdateElementsForDiff, {
      sortIndexUpdates,
      locationUpdates,
    });
  }

  // 6. 处理新增元素
  const addedIds: number[] = [];
  const addedWithoutCache: typeof added = [];

  if (added.length > 0) {
    // 检查字符串缓存
    const existingStrings = await executeQuery(
      { db: drizzle },
      listCachedTranslatableStrings,
      {
        items: added.map((el) => ({
          text: el.text,
          languageId: el.languageId,
        })),
      },
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
      const insertedIds = await executeCommand(
        { db: drizzle },
        createElements,
        {
          data: addedWithCache.map((el) => ({
            sortIndex: el.sortIndex,
            meta: el.meta,
            documentId: data.documentId,
            stringId: el.stringId,
            sourceStartLine: el.sourceStartLine ?? null,
            sourceEndLine: el.sourceEndLine ?? null,
            sourceLocationMeta: el.sourceLocationMeta ?? null,
          })),
        },
      );
      addedIds.push(...insertedIds);
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
    await executeCommand({ db: drizzle }, deleteElementsByIds, {
      elementIds: removedElementIds,
    });
  }

  return {
    addedElementIds: addedIds,
    removedElementIds,
    documentId: data.documentId,
  };
};
