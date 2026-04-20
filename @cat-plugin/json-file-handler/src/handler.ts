import { jsonParser } from "@cat/file-parsers";
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
    return "JSON";
  }

  canImport({ name }: CanImportContext): boolean {
    return jsonParser.canParse(name);
  }

  async import({ fileContent }: ImportContext): Promise<ElementData[]> {
    return jsonParser.parse(fileContent.toString("utf-8"));
  }
}

export class Exporter extends FileExporter {
  getId(): string {
    return "JSON";
  }

  canExport({ name }: CanExportContext): boolean {
    return jsonParser.canParse(name);
  }

  async export({ fileContent, elements }: ExportContext): Promise<Buffer> {
    const result = jsonParser.serialize(
      fileContent.toString("utf-8"),
      elements,
    );
    return Buffer.from(result, "utf-8");
  }
}
