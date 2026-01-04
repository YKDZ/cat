import {
  and,
  document,
  eq,
  isNotNull,
  project,
  sql,
  translatableElement,
  translationSnapshot,
  translationSnapshotItem,
  type DrizzleTransaction,
} from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";

/**
 * 为给定项目的所有元素的已被批准的翻译创建一个快照
 * @param tx
 * @param projectId
 * @returns 返回插入的快照项的数量
 */
export const takeSnapshot = async (
  tx: DrizzleTransaction,
  projectId: string,
  creatorId?: string,
): Promise<number> => {
  const translations = await tx
    .select({
      translationId: sql<number>`${translatableElement.approvedTranslationId}`,
      elementId: translatableElement.id,
    })
    .from(translatableElement)
    .innerJoin(document, eq(translatableElement.documentId, document.id))
    .innerJoin(project, eq(document.projectId, project.id))
    .where(
      and(
        eq(project.id, projectId),
        isNotNull(translatableElement.approvedTranslationId),
      ),
    );

  if (translations.length === 0) return 0;

  const { id: snapshotId } = assertSingleNonNullish(
    await tx
      .insert(translationSnapshot)
      .values({
        projectId,
        creatorId,
      })
      .returning({
        id: translationSnapshot.id,
      }),
  );

  const result = await tx.insert(translationSnapshotItem).values(
    translations.map(({ translationId, elementId }) => ({
      snapshotId,
      translationId,
      elementId,
    })),
  );

  return result.rowCount ?? 0;
};
