import { listGlossaryTermPairs, type GlossaryTermPairData } from "@cat/domain";

import { runAppQuery } from "@/server/domain";

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
  return runAppQuery(listGlossaryTermPairs, {
    glossaryId,
    sourceLanguageId,
    targetLanguageId,
    pageIndex,
    pageSize,
  });
};
