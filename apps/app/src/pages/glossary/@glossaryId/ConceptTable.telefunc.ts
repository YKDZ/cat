import {
  createInProcessCollector,
  createGlossaryConcept,
  createGlossaryConceptSubject,
  domainEventBus,
  executeCommand,
  listGlossaryConcepts,
  listGlossaryConceptSubjects,
  type GlossaryConceptData,
} from "@cat/domain";

import {
  runAppCommand,
  runAppQuery,
  withAppDrizzleTransaction,
} from "@/server/domain";
import { requireTelefuncPermission } from "@/server/telefunc-auth";

export type ConceptData = GlossaryConceptData;

export type PagedResult<T> = {
  data: T[];
  total: number;
};

export const onRequestConcept = async (
  glossaryId: string,
  pageIndex: number,
  pageSize: number,
): Promise<PagedResult<ConceptData>> => {
  return runAppQuery(listGlossaryConcepts, {
    glossaryId,
    pageIndex,
    pageSize,
  });
};

export const onCreateConceptSubject = async (
  glossaryId: string,
  subject: string,
  defaultDefinition?: string,
): Promise<{ id: number }> => {
  await requireTelefuncPermission("glossary", "editor", glossaryId);
  return runAppCommand(createGlossaryConceptSubject, {
    glossaryId,
    subject,
    defaultDefinition,
  });
};

export const onCreateConcept = async (
  glossaryId: string,
  definition: string,
  subjectIds?: number[],
): Promise<{ id: number }> => {
  await requireTelefuncPermission("glossary", "editor", glossaryId);
  return withAppDrizzleTransaction(async (tx) => {
    const collector = createInProcessCollector(domainEventBus);
    const result = await executeCommand(
      { db: tx, collector },
      createGlossaryConcept,
      {
        glossaryId,
        definition,
        subjectIds,
      },
    );

    await collector.flush();

    return result;
  });
};

export const onRequestConceptSubjects = async (
  glossaryId: string,
): Promise<Array<{ id: number; subject: string }>> => {
  await requireTelefuncPermission("glossary", "viewer", glossaryId);
  return runAppQuery(listGlossaryConceptSubjects, {
    glossaryId,
  });
};
