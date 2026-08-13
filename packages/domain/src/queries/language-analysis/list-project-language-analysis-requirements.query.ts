import {
  and,
  contentNode,
  eq,
  isNotNull,
  projectTargetLanguage,
} from "@cat/db";
import { normalizeLanguageId, type NormalizedLanguageId } from "@cat/shared";
import * as z from "zod";

import type { Query } from "#/types.ts";

export const ListProjectLanguageAnalysisRequirementsQuerySchema =
  z.strictObject({ projectId: z.uuidv4() });

/** Canonical target and admitted content languages required by a project. */
export const listProjectLanguageAnalysisRequirements: Query<
  z.infer<typeof ListProjectLanguageAnalysisRequirementsQuerySchema>,
  NormalizedLanguageId[]
> = async (ctx, query) => {
  const [targets, contentLanguages] = await Promise.all([
    ctx.db
      .select({ languageId: projectTargetLanguage.languageId })
      .from(projectTargetLanguage)
      .where(eq(projectTargetLanguage.projectId, query.projectId)),
    ctx.db
      .selectDistinct({ languageId: contentNode.languageId })
      .from(contentNode)
      .where(
        and(
          eq(contentNode.projectId, query.projectId),
          isNotNull(contentNode.languageId),
        ),
      ),
  ]);
  return [
    ...new Set(
      [...targets, ...contentLanguages].flatMap(({ languageId }) =>
        languageId === null ? [] : [normalizeLanguageId(languageId)],
      ),
    ),
  ].sort((left, right) => left.localeCompare(right));
};
