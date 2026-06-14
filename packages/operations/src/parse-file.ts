import type { OperationContext } from "@cat/domain";

import { getDbHandle } from "@cat/domain";
import {
  executeQuery,
  getActiveFileBlobInfo,
  getContentNode,
} from "@cat/domain";
import {
  PluginManager,
  type FileImporter,
  type StorageProvider,
} from "@cat/plugin-core";
import { getServiceFromDBId, readableToBuffer } from "@cat/server-shared";
import {
  assertFirstNonNullish,
  StructuredContentPayloadSchema,
  type StructuredContentPayload,
} from "@cat/shared";
import * as z from "zod";

export const ParseFileInputSchema = z.object({
  projectId: z.uuidv4(),
  fileId: z.int(),
  languageId: z.string(),
  contentNodeId: z.uuidv4().optional(),
});

export const ParseFileOutputSchema = z.object({
  payload: StructuredContentPayloadSchema,
});

export type ParseFileInput = z.infer<typeof ParseFileInputSchema>;
export type ParseFileOutput = z.infer<typeof ParseFileOutputSchema>;

/**
 *
 * 通过 FILE_IMPORTER 插件解析文件，并组装 StructuredContentPayload。
 * Parse file content into a structured content graph payload.
 *
 * Parses the file via the FILE_IMPORTER plugin and assembles a
 * StructuredContentPayload.
 *
 * @param data - Parse input parameters
 * @param _ctx - Operation context (unused)
 * @returns - Structured content graph payload
 */
export const parseFileOp = async (
  data: ParseFileInput,
  _ctx?: OperationContext,
): Promise<ParseFileOutput> => {
  const { client: drizzle } = await getDbHandle();
  const pluginManager = PluginManager.get("GLOBAL", "");

  const fileBlobInfo = await executeQuery(
    { db: drizzle },
    getActiveFileBlobInfo,
    {
      fileId: data.fileId,
    },
  );

  if (fileBlobInfo === null) {
    throw new Error(`File ${data.fileId} not found`);
  }

  const { name, key, storageProviderId } = fileBlobInfo;
  const existingContentNode = data.contentNodeId
    ? await executeQuery({ db: drizzle }, getContentNode, {
        id: data.contentNodeId,
      })
    : null;

  if (data.contentNodeId && existingContentNode === null) {
    throw new Error(`Content node ${data.contentNodeId} not found`);
  }

  const provider = getServiceFromDBId<StorageProvider>(
    pluginManager,
    storageProviderId,
  );
  const handler = assertFirstNonNullish(
    pluginManager
      .getServices("FILE_IMPORTER")
      // oxlint-disable-next-line no-unsafe-type-assertion
      .filter((h) => (h.service as FileImporter).canImport({ name }))
      .map((h) => h.service),
  ) as FileImporter;

  const fileContent = await readableToBuffer(await provider.getStream({ key }));

  const sourceRootRef =
    existingContentNode?.sourceRootRef ??
    (data.contentNodeId
      ? `content-node:${data.contentNodeId}`
      : `uploaded-file-name:${name}`);
  const sourceNodeRef = data.contentNodeId
    ? `content-node:${data.contentNodeId}`
    : `file:${data.fileId}`;
  const stableSourceNodeRef =
    existingContentNode?.stableSourceNodeRef ?? `file-name:${name}`;

  const imported = await handler.import({
    fileContent,
    name,
    fileId: data.fileId,
    contentNodeId: data.contentNodeId,
    sourceRootRef,
    sourceNodeRef,
    stableSourceNodeRef,
  });

  const payloadImporterId =
    existingContentNode?.importerId ?? imported.importerId;
  const payloadSourceRootRef =
    existingContentNode?.sourceRootRef ?? imported.sourceRootRef;
  const payloadSourceNode = {
    ref: imported.sourceNode.ref,
    kind: existingContentNode?.kind ?? "FILE",
    displayLabel:
      existingContentNode?.displayLabel ?? imported.sourceNode.displayLabel,
    importerId: payloadImporterId,
    sourceRootRef: payloadSourceRootRef,
    stableSourceNodeRef:
      existingContentNode?.stableSourceNodeRef ??
      imported.sourceNode.stableSourceNodeRef,
    sourcePath:
      imported.sourceNode.sourcePath ?? existingContentNode?.sourcePath ?? null,
    sourceType:
      imported.sourceNode.sourceType ?? existingContentNode?.sourceType ?? null,
    languageId: existingContentNode?.languageId ?? null,
    exportRole: existingContentNode?.exportRole ?? "NONE",
    boundaryType: existingContentNode?.boundaryType ?? "NONE",
    file: existingContentNode
      ? {
          fileId: data.fileId,
          fileHandlerId: existingContentNode.fileHandlerId,
        }
      : null,
  };

  const payload: StructuredContentPayload =
    StructuredContentPayloadSchema.parse({
      payloadVersion: "content-graph/v1",
      projectId: data.projectId,
      sourceLanguageId: data.languageId,
      importerId: payloadImporterId,
      sourceRootRef: payloadSourceRootRef,
      relationTypes: imported.relationTypes ?? [],
      nodes: [payloadSourceNode],
      elements: imported.elements.map((element) => ({
        ref: element.ref,
        stableSourceRef: element.stableSourceRef,
        sourceNodeRef: element.sourceNodeRef ?? imported.sourceNode.ref,
        text: element.text,
        languageId: data.languageId,
        localOrder: element.localOrder,
        meta: element.meta ?? null,
        location: element.location,
      })),
      relations: imported.relations ?? [],
      evidence: imported.evidence ?? [],
    });

  return { payload };
};
