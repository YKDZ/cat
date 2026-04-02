import type { OperationContext } from "@cat/domain";

import { getDbHandle } from "@cat/domain";
import { executeQuery, getActiveFileBlobInfo } from "@cat/domain";
import {
  PluginManager,
  type FileImporter,
  type StorageProvider,
} from "@cat/plugin-core";
import { getServiceFromDBId, readableToBuffer } from "@cat/server-shared";
import { safeZDotJson } from "@cat/shared/schema/json";
import { assertFirstNonNullish } from "@cat/shared/utils";
import * as z from "zod";

export const ParseFileInputSchema = z.object({
  fileId: z.int(),
  languageId: z.string(),
});

export const ParseFileOutputSchema = z.object({
  elements: z.array(
    z.object({
      text: z.string(),
      sortIndex: z.int(),
      languageId: z.string(),
      meta: safeZDotJson,
      sourceStartLine: z.int().nullable().optional(),
      sourceEndLine: z.int().nullable().optional(),
      sourceLocationMeta: safeZDotJson.nullable().optional(),
    }),
  ),
});

export type ParseFileInput = z.infer<typeof ParseFileInputSchema>;
export type ParseFileOutput = z.infer<typeof ParseFileOutputSchema>;

/**
 * @zh 解析文件内容为可翻译元素列表。
 *
 * 通过 FILE_IMPORTER 插件解析文件，并为每个元素补全 sortIndex。
 * @en Parse file content into a list of translatable elements.
 *
 * Parses the file via the FILE_IMPORTER plugin, then fills in the
 * sortIndex for each element.
 *
 * @param data - {@zh 解析输入参数（文件 ID 和语言 ID）} {@en Parse input parameters (file ID and language ID)}
 * @param _ctx - {@zh 操作上下文（未使用）} {@en Operation context (unused)}
 * @returns - {@zh 解析得到的可翻译元素列表} {@en Parsed list of translatable elements}
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
  const extracted = await handler.import({ fileContent });

  // 补全 sortIndex
  let maxSortIndex = -1;
  extracted.forEach((item) => {
    if (typeof item.sortIndex === "number") {
      maxSortIndex = Math.max(maxSortIndex, item.sortIndex);
    }
  });

  let currentIndex = maxSortIndex;
  const elements = extracted.map((item) => {
    const sortIndex =
      typeof item.sortIndex === "number" ? item.sortIndex : (currentIndex += 1);
    return {
      ...item,
      sortIndex,
      languageId: data.languageId,
      sourceStartLine: item.location?.startLine ?? null,
      sourceEndLine: item.location?.endLine ?? null,
      sourceLocationMeta: item.location?.custom ?? null,
    };
  });

  elements.sort((a, b) => a.sortIndex - b.sortIndex);

  return { elements };
};
