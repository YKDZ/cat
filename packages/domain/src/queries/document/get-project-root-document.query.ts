import {
  and,
  document,
  documentClosure,
  DrizzleClient,
  eq,
  notExists,
  sql,
} from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";

/**
 * Query the root document for a project — the document with no parent in the
 * closure table.
 */
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
