import type { TranslatableElementDataWithoutLanguageId } from "@cat/shared/schema/misc";
import type { File } from "@cat/shared/schema/drizzle/file";
import type { IPluginService } from "@/registry/plugin-registry.ts";
import { JSONType } from "@cat/shared/schema/json";

export interface TranslatableFileHandler extends IPluginService {
  canExtractElement(file: File): boolean;
  extractElement(
    fileContent: Buffer,
  ): Promise<TranslatableElementDataWithoutLanguageId[]>;
  canGetReplacedFileContent(file: File): boolean;
  getReplacedFileContent(
    fileContent: Buffer,
    elements: { meta: JSONType; value: string }[],
  ): Promise<Buffer>;
}
