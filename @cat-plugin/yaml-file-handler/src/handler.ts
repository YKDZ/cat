import { yamlParser } from "@cat/file-parsers";
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
    return "YAML";
  }

  canImport({ name }: CanImportContext): boolean {
    return yamlParser.canParse(name);
  }

  async import({ fileContent }: ImportContext): Promise<ElementData[]> {
    return yamlParser.parse(fileContent.toString("utf-8"));
  }
}

export class Exporter extends FileExporter {
  getId(): string {
    return "YAML";
  }

  canExport({ name }: CanExportContext): boolean {
    return yamlParser.canParse(name);
  }

  async export({ fileContent, elements }: ExportContext): Promise<Buffer> {
    const result = yamlParser.serialize(
      fileContent.toString("utf-8"),
      elements,
    );
    return Buffer.from(result, "utf-8");
  }
}
