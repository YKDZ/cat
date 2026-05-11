import { jsonParser } from "@cat/file-parsers";
import {
  FileExporter,
  FileImporter,
  type CanExportContext,
  type CanImportContext,
  type ExportContext,
  type FileImportResult,
  type ImportContext,
} from "@cat/plugin-core";

export class Importer extends FileImporter {
  getId(): string {
    return "JSON";
  }

  canImport({ name }: CanImportContext): boolean {
    return jsonParser.canParse(name);
  }

  async import({
    fileContent,
    name,
    sourceRootRef,
    sourceNodeRef,
    stableSourceNodeRef,
  }: ImportContext): Promise<FileImportResult> {
    const elements = jsonParser.parse(fileContent.toString("utf-8"));
    const nodeRef = sourceNodeRef;
    return {
      importerId: this.getId(),
      sourceRootRef,
      sourceNode: {
        ref: nodeRef,
        stableSourceNodeRef,
        displayLabel: name,
        sourcePath: name,
        sourceType: "application/json",
      },
      elements: elements.map((element) => ({
        ...element,
        sourceNodeRef: nodeRef,
      })),
      relations: elements.map((element, index) => ({
        type: { namespace: "core", name: "contains", version: "1.0.0" },
        source: { kind: "NODE" as const, nodeRef },
        target: { kind: "ELEMENT" as const, elementRef: element.ref },
        isPrimary: true,
        localOrder: element.localOrder ?? index,
        confidenceBasisPoints: 10000,
      })),
    };
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
