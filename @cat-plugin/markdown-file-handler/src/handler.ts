import { markdownParser } from "@cat/file-parsers";
import {
  FileExporter,
  FileImporter,
  type CanExportContext,
  type CanImportContext,
  type ElementData,
  type ExportContext,
  type ImportContext,
} from "@cat/plugin-core";

export class Importer extends FileImporter {
  getId(): string {
    return "MARKDOWN";
  }

  canImport({ name }: CanImportContext): boolean {
    return markdownParser.canParse(name);
  }

  async import({ fileContent }: ImportContext): Promise<ElementData[]> {
    return markdownParser.parse(fileContent.toString("utf-8"));
  }
}

export class Exporter extends FileExporter {
  getId(): string {
    return "MARKDOWN";
  }

  canExport({ name }: CanExportContext): boolean {
    return markdownParser.canParse(name);
  }

  async export({ fileContent, elements }: ExportContext): Promise<Buffer> {
    const result = markdownParser.serialize(
      fileContent.toString("utf-8"),
      elements,
    );
    return Buffer.from(result, "utf-8");
  }
}
