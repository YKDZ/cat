import type { TranslatableElementDataWithoutLanguageId } from "@cat/shared/schema/misc";
import type { TranslatableElement } from "@cat/shared/schema/drizzle/document";
import type { File } from "@cat/shared/schema/drizzle/file";
import type { IPluginService } from "@/registry/plugin-registry.ts";

export interface TranslatableFileHandler extends IPluginService {
  canExtractElement(file: File): boolean;
  extractElement(
    fileContent: Buffer,
  ): Promise<TranslatableElementDataWithoutLanguageId[]>;
  canGetReplacedFileContent(file: File): boolean;
  getReplacedFileContent(
    fileContent: Buffer,
    elements: Pick<TranslatableElement, "meta" | "value">[],
  ): Promise<Buffer>;
}
