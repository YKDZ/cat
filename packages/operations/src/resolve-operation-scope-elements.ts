import type { OperationContext } from "@cat/domain";
import {
  executeQuery,
  getBranchById,
  getDbHandle,
  listEditorScopeContentNodes,
  listEditorScopeElements,
  listElementsWithChunkIdsByIds,
} from "@cat/domain";
import type { EditorElement } from "@cat/shared";
import {
  EditorTranslationStatusFilterSchema,
  MAX_BATCH_AUTO_TRANSLATION_SNAPSHOT_ELEMENTS,
  OperationScopeSchema,
} from "@cat/shared";
import * as z from "zod";

type DbClient = Awaited<ReturnType<typeof getDbHandle>>["client"];

/**
 * Schema for resolving elements inside an operation scope.
 */
export const ResolveOperationScopeElementsInputSchema =
  OperationScopeSchema.extend({
    elementIds: z
      .array(z.int().positive())
      .max(MAX_BATCH_AUTO_TRANSLATION_SNAPSHOT_ELEMENTS),
    languageToId: z.string().min(1),
    statusFilter: EditorTranslationStatusFilterSchema.default("all"),
    sourceLanguageId: z.string().optional(),
    exactElementIds: z.boolean().default(false),
  });

/**
 * Input type for resolving elements inside an operation scope.
 */
export type ResolveOperationScopeElementsInput = z.input<
  typeof ResolveOperationScopeElementsInputSchema
>;

/**
 * Operation-scope element with chunk metadata.
 */
export type OperationScopeElement = {
  id: number;
  projectId: string;
  primaryContentNodeId: string | null;
  value: string;
  languageId: string;
  chunkIds: number[];
};

const collectPagedScopeElements = async (
  db: DbClient,
  input: z.infer<typeof ResolveOperationScopeElementsInputSchema>,
): Promise<EditorElement[]> => {
  const elements: EditorElement[] = [];
  const pageSize = 100;
  let page = 0;

  while (true) {
    // oxlint-disable-next-line no-await-in-loop
    const rows = await executeQuery({ db }, listEditorScopeElements, {
      projectId: input.projectId,
      languageToId: input.languageToId,
      branchId: input.branchId,
      contentNodeIds: input.contentNodeIds,
      searchQuery: "",
      statusFilter: input.statusFilter,
      sortMode: input.sortMode,
      page,
      pageSize,
    });

    elements.push(...rows);
    if (rows.length < pageSize) break;
    page += 1;
  }

  return elements;
};

const assertOperationScopeContext = async (
  db: DbClient,
  input: z.infer<typeof ResolveOperationScopeElementsInputSchema>,
): Promise<void> => {
  if (input.branchId !== undefined) {
    const branch = await executeQuery({ db }, getBranchById, {
      branchId: input.branchId,
    });

    if (!branch || branch.projectId !== input.projectId) {
      throw new Error(
        `Branch ${input.branchId} does not belong to project ${input.projectId}`,
      );
    }
  }

  if (input.contentNodeIds.length === 0) return;

  const visibleNodes = await executeQuery({ db }, listEditorScopeContentNodes, {
    projectId: input.projectId,
    branchId: input.branchId,
  });
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));

  for (const contentNodeId of input.contentNodeIds) {
    if (!visibleNodeIds.has(contentNodeId)) {
      throw new Error(
        `Content node ${contentNodeId} is not visible in project ${input.projectId}`,
      );
    }
  }
};

/**
 * Resolve elements inside an operation scope with chunk metadata.
 *
 * @param data - Operation-scope input
 * @param _ctx - Operation context (currently unused)
 * @returns - Resolved element list
 */
export const resolveOperationScopeElementsOp = async (
  data: ResolveOperationScopeElementsInput,
  _ctx?: OperationContext,
): Promise<{ elements: OperationScopeElement[] }> => {
  const input = ResolveOperationScopeElementsInputSchema.parse(data);
  const { client: db } = await getDbHandle();

  await assertOperationScopeContext(db, input);

  const requestedDirectElementIds = new Set<number>(input.elementIds);
  const collectedScopeElements = await collectPagedScopeElements(db, input);
  const scopeElements = input.exactElementIds
    ? collectedScopeElements.filter((element) =>
        requestedDirectElementIds.has(element.id),
      )
    : collectedScopeElements;
  const elementIds = new Set<number>([
    ...input.elementIds,
    ...scopeElements.map((element) => element.id),
  ]);

  const detailIds = [...elementIds];
  const detailIdBatches = Array.from(
    { length: Math.ceil(detailIds.length / 5_000) },
    (_, index) => detailIds.slice(index * 5_000, (index + 1) * 5_000),
  );
  const details = (
    await Promise.all(
      detailIdBatches.map(
        async (elementIds) =>
          await executeQuery({ db }, listElementsWithChunkIdsByIds, {
            elementIds,
          }),
      ),
    )
  ).flat();
  const detailById = new Map(details.map((element) => [element.id, element]));

  for (const requestedId of requestedDirectElementIds) {
    const detail = detailById.get(requestedId);
    if (!detail) {
      throw new Error(`Element ${requestedId} does not exist`);
    }
    if (detail.projectId !== input.projectId) {
      throw new Error(
        `Element ${requestedId} does not belong to project ${input.projectId}`,
      );
    }
  }

  const elementsById = new Map<number, OperationScopeElement>();
  for (const scopeElement of scopeElements) {
    const detail = detailById.get(scopeElement.id);
    if (!detail) continue;

    elementsById.set(scopeElement.id, {
      id: scopeElement.id,
      projectId: input.projectId,
      primaryContentNodeId: scopeElement.primaryContentNodeId,
      value: scopeElement.value,
      languageId: scopeElement.languageId,
      chunkIds: detail.chunkIds,
    });
  }

  if (!input.exactElementIds) {
    for (const requestedId of input.elementIds) {
      const detail = detailById.get(requestedId);
      if (!detail || !requestedDirectElementIds.has(detail.id)) continue;
      elementsById.set(detail.id, detail);
    }
  }

  const resolvedElements = input.exactElementIds
    ? input.elementIds.flatMap((elementId) => {
        const element = elementsById.get(elementId);
        return element ? [element] : [];
      })
    : [...elementsById.values()];
  const elements = resolvedElements.filter((element) => {
    if (element.projectId !== input.projectId) return false;
    if (input.sourceLanguageId === undefined) return true;
    return element.languageId === input.sourceLanguageId;
  });

  if (input.sourceLanguageId !== undefined) {
    for (const requestedId of requestedDirectElementIds) {
      const element = elementsById.get(requestedId);
      if (element && element.languageId !== input.sourceLanguageId) {
        throw new Error(
          `Element ${requestedId} language ${element.languageId} does not match ${input.sourceLanguageId}`,
        );
      }
    }
  }

  return { elements };
};
