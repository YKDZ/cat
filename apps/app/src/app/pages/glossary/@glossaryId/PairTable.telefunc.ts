import { listGlossaryTermPairs, type GlossaryTermPairData } from "@cat/domain";

import { runAppQuery } from "@/server/domain";
import { requireTelefuncPermission } from "@/server/telefunc-auth";

export type PairData = GlossaryTermPairData;

export type PagedResult<T> = {
  data: T[];
  total: number;
};

export const onRequestTermPair = async (
  glossaryId: string,
  sourceLanguageId: string,
  targetLanguageId: string,
  pageIndex: number,
  pageSize: number,
): Promise<PagedResult<PairData>> => {
  await requireTelefuncPermission("glossary", "viewer", glossaryId);
  return runAppQuery(listGlossaryTermPairs, {
    glossaryId,
    sourceLanguageId,
    targetLanguageId,
    pageIndex,
    pageSize,
  });
};
