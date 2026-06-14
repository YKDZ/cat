import type {
  StructuredContentNodeInput,
  StructuredEvidenceInput,
  StructuredRelationInput,
  StructuredTranslatableElementInput,
} from "@cat/shared";

import { glob } from "glob";
import { readFile } from "node:fs/promises";
import { extname, relative } from "node:path";

import type {
  SourceCollectionDiagnostic,
  SourceExtractionGraphResult,
  SourceExtractOptions,
} from "./types.ts";

type FileExtractionResult = {
  fileNode: StructuredContentNodeInput;
  elements: StructuredTranslatableElementInput[];
  relations: StructuredRelationInput[];
  evidence: StructuredEvidenceInput[];
  diagnostics: SourceCollectionDiagnostic[];
};

type DiagnosticOnlyExtractionResult = {
  diagnostics: SourceCollectionDiagnostic[];
};

const hasFileExtractionResult = (
  result: FileExtractionResult | DiagnosticOnlyExtractionResult,
): result is FileExtractionResult => {
  return "fileNode" in result;
};

/**
 * Extract translatable elements from source files, returning graph-structured result (no platform params).
 *
 * @param options - Pure extraction options
 * @returns - Graph-structured extraction result
 */
export async function extract(
  options: SourceExtractOptions,
): Promise<SourceExtractionGraphResult> {
  const { globs, extractors, baseDir } = options;
  const sourceLanguageId = options.sourceLanguageId ?? "en";

  const files = (await glob(globs, { cwd: baseDir, absolute: true })).sort();

  const extMap = new Map<string, (typeof extractors)[number]>();
  for (const ext of extractors) {
    for (const supportedExt of ext.supportedExtensions) {
      if (!extMap.has(supportedExt)) {
        extMap.set(supportedExt, ext);
      }
    }
  }

  const allNodes: StructuredContentNodeInput[] = [];
  const allElements: StructuredTranslatableElementInput[] = [];
  const allRelations: StructuredRelationInput[] = [];
  const allEvidence: StructuredEvidenceInput[] = [];
  const diagnostics: SourceCollectionDiagnostic[] = [];

  const results = await Promise.all(
    files.map(async (absPath) => {
      const relPath = relative(baseDir, absPath);
      const ext = extname(absPath);

      const extractor = extMap.get(ext);
      if (!extractor) {
        return {
          diagnostics: [
            {
              severity: "warning" as const,
              code: "NO_EXTRACTOR" as const,
              filePath: relPath,
              message: `No extractor registered for ${relPath}`,
              details: { extension: ext },
            },
          ],
        };
      }

      let content: string;
      try {
        content = await readFile(absPath, "utf-8");
      } catch (err) {
        return {
          diagnostics: [
            {
              severity: "error" as const,
              code: "READ_FAILED" as const,
              filePath: relPath,
              message: `Failed to read ${relPath}`,
              details: {
                error: err instanceof Error ? err.message : String(err),
              },
            },
          ],
        };
      }

      let elements: StructuredTranslatableElementInput[];
      try {
        elements = extractor.extract({
          content,
          filePath: relPath,
          sourceLanguageId,
        });
      } catch (err) {
        return {
          diagnostics: [
            {
              severity: "error" as const,
              code: "EXTRACT_FAILED" as const,
              filePath: relPath,
              message: `Extraction failed for ${relPath}`,
              details: {
                error: err instanceof Error ? err.message : String(err),
              },
            },
          ],
        };
      }

      const fileDiagnostics: SourceCollectionDiagnostic[] = [];
      for (const element of elements) {
        if (element.languageId !== sourceLanguageId) {
          fileDiagnostics.push({
            severity: "error",
            code: "LANGUAGE_MISMATCH",
            filePath: relPath,
            message: `Element ${element.ref} language ${element.languageId} does not match configured source language ${sourceLanguageId}`,
            details: {
              elementRef: element.ref,
              actual: element.languageId,
              expected: sourceLanguageId,
            },
          });
        }
      }

      const sourceNodeRef = `source-file:${relPath}`;
      const fileNode: StructuredContentNodeInput = {
        ref: sourceNodeRef,
        kind: "SOURCE_COMPONENT",
        displayLabel: relPath,
        importerId: extractor.id,
        sourceRootRef: baseDir,
        stableSourceNodeRef: sourceNodeRef,
        sourcePath: relPath,
        sourceType: ext.replace(".", ""),
        exportRole: "NONE",
        boundaryType: "FILE",
      };

      const fileRelations: StructuredRelationInput[] = [];
      const fileEvidence: StructuredEvidenceInput[] = [];

      for (const el of elements) {
        fileRelations.push({
          type: { namespace: "core", name: "contains", version: "1.0.0" },
          source: { kind: "NODE" as const, nodeRef: sourceNodeRef },
          target: { kind: "ELEMENT" as const, elementRef: el.ref },
          localOrder: el.localOrder ?? 0,
          isPrimary: true,
          confidenceBasisPoints: 10000,
        });

        fileEvidence.push({
          attachedTo: { kind: "ELEMENT", elementRef: el.ref },
          kind: "SOURCE_LOCATION",
          textData: `Source: ${relPath}`,
          displayLabel: "source file",
          trustLevel: "COLLECTED",
          provenance: { extractorId: extractor.id, filePath: relPath },
        });

        function getI18nContext(v: unknown): string | undefined {
          if (v !== null && typeof v === "object" && "i18nContext" in v) {
            const ctx = (v as { i18nContext: unknown }).i18nContext;
            return typeof ctx === "string" ? ctx : undefined;
          }
          return undefined;
        }
        const i18nCtx = getI18nContext(el.location?.custom);
        if (typeof i18nCtx === "string") {
          fileEvidence.push({
            attachedTo: { kind: "ELEMENT", elementRef: el.ref },
            kind: "TEXT",
            textData: i18nCtx,
            displayLabel: "i18n context comment",
            trustLevel: "COLLECTED",
            provenance: { extractorId: extractor.id, filePath: relPath },
          });
        }
      }

      return {
        fileNode,
        elements,
        relations: fileRelations,
        evidence: fileEvidence,
        diagnostics: fileDiagnostics,
      };
    }),
  );

  for (const result of results) {
    if (!result) continue;
    diagnostics.push(...result.diagnostics);
    if (!hasFileExtractionResult(result)) continue;
    allNodes.push(result.fileNode);
    allElements.push(...result.elements);
    allRelations.push(...result.relations);
    allEvidence.push(...result.evidence);
  }

  const importerId = extractors.map((e) => e.id).join(",");

  // Always add a root node representing the base directory so the payload
  // always satisfies the nodes.min(1) constraint.
  const rootNodeRef = `source-root:${baseDir}`;
  if (!allNodes.some((n) => n.ref === rootNodeRef)) {
    allNodes.unshift({
      ref: rootNodeRef,
      kind: "SOURCE_COMPONENT",
      displayLabel: baseDir,
      importerId,
      sourceRootRef: baseDir,
      stableSourceNodeRef: rootNodeRef,
      exportRole: "NONE",
      boundaryType: "FILE",
    });
  }

  const identityCounts = new Map<string, number>();
  for (const element of allElements) {
    const key = `${element.sourceNodeRef}\u0000${element.stableSourceRef}`;
    identityCounts.set(key, (identityCounts.get(key) ?? 0) + 1);
  }

  for (const [key, count] of identityCounts) {
    if (count > 1) {
      diagnostics.push({
        severity: "error",
        code: "DUPLICATE_STABLE_IDENTITY",
        message: `Duplicate stable source identity ${key}`,
        details: { key, count },
      });
    }
  }

  return {
    importerId,
    relationTypes: [],
    nodes: allNodes,
    elements: allElements,
    relations: allRelations,
    evidence: allEvidence,
    diagnostics,
  };
}
