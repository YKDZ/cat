import {
  and,
  document,
  documentClosure,
  DrizzleClient,
  eq,
  increment,
  notExists,
  sql,
} from "@cat/db";
import { Document } from "@cat/shared/schema/drizzle/document";
import { assertSingleNonNullish } from "@cat/shared/utils";

export const getProjectRootDocument = async (
  db: Omit<DrizzleClient, "$client">,
  projectId: string,
): Promise<string> => {
  const root = assertSingleNonNullish(
    await db
      .select({
        id: document.id,
      })
      .from(document)
      .where(
        and(
          eq(document.projectId, projectId),
          notExists(
            db
              .select({ _: sql`1` })
              .from(documentClosure)
              .where(
                and(
                  eq(documentClosure.descendant, document.id),
                  eq(documentClosure.depth, 1),
                  eq(documentClosure.projectId, projectId),
                ),
              ),
          ),
        ),
      )
      .limit(1),
    `No root found for project ${projectId}`,
  );

  return root.id;
};

export const createDocumentUnderParent = async (
  drizzle: Omit<DrizzleClient, "$client">,
  input: {
    name: string;
    projectId: string;
    creatorId: string;
    isDirectory?: boolean;
    fileId?: number | null;
    fileHandlerId?: number | null;
  },
  parentId: string | null = null,
): Promise<Document> => {
  return await drizzle.transaction(async (tx) => {
    const actualParentId =
      parentId ?? (await getProjectRootDocument(tx, input.projectId));

    assertSingleNonNullish(
      await tx
        .select({
          id: document.id,
        })
        .from(document)
        .where(
          and(
            eq(document.isDirectory, true),
            eq(document.projectId, input.projectId),
            eq(document.id, actualParentId),
          ),
        )
        .limit(1),
    );

    const newDoc = assertSingleNonNullish(
      await tx
        .insert(document)
        .values({
          name: input.name,
          projectId: input.projectId,
          creatorId: input.creatorId,
          isDirectory: input.isDirectory ?? false,
          fileId: input.fileId ?? null,
          fileHandlerId: input.fileHandlerId ?? null,
        })
        .returning(),
    );

    await tx
      .insert(documentClosure)
      .select(
        tx
          .select({
            ancestor: documentClosure.ancestor,
            // https://github.com/drizzle-team/drizzle-orm/issues/3656
            descendant: sql<string>`${newDoc.id}`.as("descendant"),
            depth: increment(documentClosure.depth).as("depth"),
            projectId: sql<string>`${input.projectId}`.as("projectId"),
          })
          .from(documentClosure)
          .where(
            and(
              eq(documentClosure.descendant, actualParentId),
              eq(documentClosure.projectId, input.projectId),
            ),
          ),
      )
      .onConflictDoNothing();

    await tx
      .insert(documentClosure)
      .values({
        ancestor: newDoc.id,
        descendant: newDoc.id,
        depth: 0,
        projectId: input.projectId,
      })
      .onConflictDoNothing();

    return newDoc;
  });
};
