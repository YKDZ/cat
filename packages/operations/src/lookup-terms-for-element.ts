import type { OperationContext } from "@cat/domain";
import { getDbHandle } from "@cat/domain";
import {
  executeQuery,
  getElementWithChunkIds,
  listProjectGlossaryIds,
} from "@cat/domain";
import type { TermData } from "@cat/shared";

import {
  collectTermRecallOp,
  getTermRecallCandidates,
} from "./collect-term-recall.ts";

/** Look up relevant project glossary terms for a translatable element. */
export const lookupTermsForElementOp = async (
  elementId: number,
  translationLanguageId: string,
  _ctx?: OperationContext,
): Promise<TermData[]> => {
  const { client: drizzle } = await getDbHandle();

  const element = await executeQuery({ db: drizzle }, getElementWithChunkIds, {
    elementId,
  });

  if (element === null) {
    return [];
  }

  const glossaryIds = await executeQuery(
    { db: drizzle },
    listProjectGlossaryIds,
    { projectId: element.projectId },
  );

  if (glossaryIds.length === 0) return [];

  const results = await collectTermRecallOp(
    {
      glossaryIds,
      text: element.value,
      sourceLanguageId: element.languageId,
      translationLanguageId,
      maxAmount: 20,
    },
    _ctx,
  );

  return getTermRecallCandidates(results).map((r) => ({
    term: r.term,
    termLanguageId: element.languageId,
    translation: r.translation,
    translationLanguageId,
    definition: r.definition ?? null,
    conceptId: r.conceptId ?? null,
    glossaryId: r.glossaryId ?? null,
  }));
};
