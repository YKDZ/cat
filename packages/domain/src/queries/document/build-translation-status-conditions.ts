import {
  and,
  eq,
  exists,
  isNotNull,
  isNull,
  not,
  translatableElement,
  translation,
  translatableString,
  type SQL,
} from "@cat/db";

import type { DbHandle } from "@/types";

export const buildTranslationStatusConditions = (
  db: DbHandle,
  isTranslated?: boolean,
  isApproved?: boolean,
  languageId?: string,
): SQL<unknown>[] => {
  const conditions: SQL<unknown>[] = [];

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
              translatableString,
              eq(translation.stringId, translatableString.id),
            )
            .where(
              and(
                eq(translation.translatableElementId, translatableElement.id),
                eq(translatableString.languageId, languageId),
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
            translatableString,
            eq(translation.stringId, translatableString.id),
          )
          .where(
            and(
              eq(translation.translatableElementId, translatableElement.id),
              eq(translatableString.languageId, languageId),
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
            translatableString,
            eq(translation.stringId, translatableString.id),
          )
          .where(
            and(
              eq(translation.translatableElementId, translatableElement.id),
              eq(translatableString.languageId, languageId),
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
          translatableString,
          eq(translation.stringId, translatableString.id),
        )
        .where(
          and(
            eq(translation.translatableElementId, translatableElement.id),
            eq(translatableString.languageId, languageId),
            isNotNull(translatableElement.approvedTranslationId),
          ),
        ),
    ),
  );

  return conditions;
};
