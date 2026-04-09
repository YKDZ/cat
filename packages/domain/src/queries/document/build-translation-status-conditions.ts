import {
  and,
  eq,
  exists,
  isNotNull,
  isNull,
  not,
  translatableElement,
  translation,
  vectorizedString,
  type SQL,
} from "@cat/db";

import type { DbHandle } from "@/types";

export const buildTranslationStatusConditions = (
  db: DbHandle,
  isTranslated?: boolean,
  isApproved?: boolean,
  languageId?: string,
): SQL[] => {
  const conditions: SQL[] = [];

  if (isTranslated === undefined && isApproved === undefined) {
    return conditions;
  }

  if (!languageId) {
    throw new Error(
      "languageId must be provided when isApproved or isTranslated is set",
    );
  }

  if (isTranslated === false && isApproved === true) {
    throw new Error("isTranslated must be true when isApproved is set");
  }

  if (isTranslated === false && isApproved === undefined) {
    conditions.push(
      not(
        exists(
          db
            .select()
            .from(translation)
            .innerJoin(
              vectorizedString,
              eq(translation.stringId, vectorizedString.id),
            )
            .where(
              and(
                eq(translation.translatableElementId, translatableElement.id),
                eq(vectorizedString.languageId, languageId),
              ),
            ),
        ),
      ),
    );

    return conditions;
  }

  if (isTranslated === true && isApproved === undefined) {
    conditions.push(
      exists(
        db
          .select()
          .from(translation)
          .innerJoin(
            vectorizedString,
            eq(translation.stringId, vectorizedString.id),
          )
          .where(
            and(
              eq(translation.translatableElementId, translatableElement.id),
              eq(vectorizedString.languageId, languageId),
            ),
          ),
      ),
    );

    return conditions;
  }

  if (isTranslated === true && isApproved === false) {
    conditions.push(
      exists(
        db
          .select()
          .from(translation)
          .innerJoin(
            vectorizedString,
            eq(translation.stringId, vectorizedString.id),
          )
          .where(
            and(
              eq(translation.translatableElementId, translatableElement.id),
              eq(vectorizedString.languageId, languageId),
              isNull(translatableElement.approvedTranslationId),
            ),
          ),
      ),
    );

    return conditions;
  }

  conditions.push(
    exists(
      db
        .select()
        .from(translation)
        .innerJoin(
          vectorizedString,
          eq(translation.stringId, vectorizedString.id),
        )
        .where(
          and(
            eq(translation.translatableElementId, translatableElement.id),
            eq(vectorizedString.languageId, languageId),
            isNotNull(translatableElement.approvedTranslationId),
          ),
        ),
    ),
  );

  return conditions;
};
