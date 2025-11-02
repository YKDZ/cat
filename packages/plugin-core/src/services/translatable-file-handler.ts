import type { TranslatableElementDataWithoutLanguageId } from "@cat/shared/schema/misc";
import type { IPluginService } from "@/registry/plugin-registry.ts";
import { JSONType } from "@cat/shared/schema/json";

export interface TranslatableFileHandler extends IPluginService {
  canExtractElement(name: string): boolean;
  extractElement(
    fileContent: Buffer,
  ): Promise<TranslatableElementDataWithoutLanguageId[]>;
  canGetReplacedFileContent(name: string): boolean;
  getReplacedFileContent(
    fileContent: Buffer,
    elements: { meta: JSONType; value: string }[],
  ): Promise<Buffer>;
}
