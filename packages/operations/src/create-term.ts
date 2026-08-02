import {
  createGlossaryTerms,
  createInProcessCollector,
  domainEventBus,
  executeCommand,
  getDbHandle,
  type OperationContext,
} from "@cat/domain";
import {
  RecallDerivationReferenceSchema,
  ServiceImplementationReferenceSchema,
} from "@cat/shared";
import { TermDataSchema } from "@cat/shared";
import * as z from "zod";

export const CreateTermInputSchema = z.object({
  glossaryId: z.uuidv4(),
  creatorId: z.uuidv4().optional(),
  data: z.array(TermDataSchema),
  vectorizer: ServiceImplementationReferenceSchema,
  vectorStorage: ServiceImplementationReferenceSchema,
});

export const CreateTermOutputSchema = z.object({
  termIds: z.array(z.int()),
  derivations: z.array(RecallDerivationReferenceSchema),
});

export type CreateTermInput = z.infer<typeof CreateTermInputSchema>;
export type CreateTermOutput = z.infer<typeof CreateTermOutputSchema>;

/**
 *
 * 直接存储术语文本（text + languageId），然后为每个 termConcept
 * 构建结构化向量化文本并向量化。
 * Create term entries.
 *
 * Directly stores term text (text + languageId), then publishes the resulting
 * domain events after the outer transaction commits.
 *
 * @param data - Term creation input parameters
 * @param ctx - Operation context
 * @returns - List of IDs of the newly created terms
 */
export const createTermOp = async (
  data: CreateTermInput,
  _ctx?: OperationContext,
): Promise<CreateTermOutput> => {
  const { client: drizzle } = await getDbHandle();
  const collector = createInProcessCollector(domainEventBus);

  const { termIds, derivations } = await drizzle.transaction(async (tx) => {
    return executeCommand({ db: tx, collector }, createGlossaryTerms, {
      glossaryId: data.glossaryId,
      creatorId: data.creatorId,
      data: data.data,
    });
  });
  await collector.flush();

  return { termIds, derivations };
};
