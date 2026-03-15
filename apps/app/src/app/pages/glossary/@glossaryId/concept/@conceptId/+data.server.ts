import type { PageContextServer } from "vike/types";

import { getGlossaryConceptDetail } from "@cat/domain";
import { redirect } from "vike/abort";

import { runAppQuery } from "@/server/domain";

export const data = async (ctx: PageContextServer) => {
  const { glossaryId, conceptId } = ctx.routeParams;

  if (!glossaryId || !conceptId) {
    throw redirect(`/glossary/${glossaryId}`);
  }

  const parsedConceptId = Number(conceptId);
  if (!Number.isFinite(parsedConceptId)) {
    throw redirect(`/glossary/${glossaryId}`);
  }

  const detail = await runAppQuery(getGlossaryConceptDetail, {
    glossaryId,
    conceptId: parsedConceptId,
  });

  if (detail === null) {
    throw redirect(`/glossary/${glossaryId}`);
  }

  return detail;
};

export type Data = Awaited<ReturnType<typeof data>>;
