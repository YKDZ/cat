import type {
  ExecutionBrowser,
  ExecutionCellInput,
  ExecutionTarget,
} from "./execution-cell.ts";
import type { TestServiceLease } from "./test-service-lease.ts";

export type E2EExecutionTarget = "all" | ExecutionTarget;

export type E2EExecutionSelection = {
  browser?: ExecutionBrowser;
  target: E2EExecutionTarget;
};

export type E2EReleaseImageIds = {
  releaseIdentity?: string;
  runtimeImageId?: string;
  standaloneImageId?: string;
};

export type E2EAttestationCell = {
  browser: ExecutionBrowser;
  imageId?: string;
  preparerImageId?: string;
  target: ExecutionTarget;
};

type E2EExecutionCell =
  | { browser: "chromium"; target: "dev" }
  | { browser: ExecutionBrowser; target: "standalone" }
  | { browser: ExecutionBrowser; target: "runtime" };

const executionCellCatalogue = [
  { browser: "chromium", target: "dev" },
  { browser: "chromium", target: "standalone" },
  { browser: "firefox", target: "standalone" },
  { browser: "chromium", target: "runtime" },
  { browser: "firefox", target: "runtime" },
] as const satisfies readonly E2EExecutionCell[];

const unsupportedSelectionError =
  "Development E2E supports Chromium only; no supported execution cell matches this selection.";

export const selectE2EExecutionCells = (
  selection: E2EExecutionSelection,
): E2EExecutionCell[] => {
  const selected = executionCellCatalogue.filter(
    (cell) =>
      (selection.target === "all" || cell.target === selection.target) &&
      (selection.browser === undefined || cell.browser === selection.browser),
  );
  if (selected.length === 0) throw new Error(unsupportedSelectionError);
  return selected.map((cell) => ({ ...cell }));
};

const assertStandaloneImage = (images: E2EReleaseImageIds): string => {
  if (images.standaloneImageId === undefined) {
    throw new Error(
      "Standalone selection did not resolve an immutable image ID",
    );
  }
  return images.standaloneImageId;
};

const assertRuntimeImages = (
  images: E2EReleaseImageIds,
): { runtimeImageId: string; standaloneImageId: string } => {
  if (
    images.runtimeImageId === undefined ||
    images.standaloneImageId === undefined
  ) {
    throw new Error(
      "Runtime selection requires explicit runtime and standalone preparer image IDs",
    );
  }
  return {
    runtimeImageId: images.runtimeImageId,
    standaloneImageId: images.standaloneImageId,
  };
};

export const attestationCellsForSelection = (
  selection: E2EExecutionSelection,
  images: E2EReleaseImageIds = {},
): E2EAttestationCell[] =>
  selectE2EExecutionCells(selection).map((cell) => {
    if (cell.target === "dev") return cell;
    if (cell.target === "standalone") {
      return { ...cell, imageId: assertStandaloneImage(images) };
    }
    const runtimeImages = assertRuntimeImages(images);
    return {
      ...cell,
      imageId: runtimeImages.runtimeImageId,
      preparerImageId: runtimeImages.standaloneImageId,
    };
  });

const attestationValidationError =
  "E2E attestation does not exactly match the selected immutable image matrix";

const parseAttestationCell = (value: unknown): E2EAttestationCell => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("E2E attestation has an invalid execution cell");
  }
  const browser = Reflect.get(value, "browser");
  const imageId = Reflect.get(value, "imageId");
  const preparerImageId = Reflect.get(value, "preparerImageId");
  const target = Reflect.get(value, "target");
  if (
    (browser !== "chromium" && browser !== "firefox") ||
    (target !== "dev" && target !== "standalone" && target !== "runtime") ||
    (imageId !== undefined && typeof imageId !== "string") ||
    (preparerImageId !== undefined && typeof preparerImageId !== "string")
  ) {
    throw new Error("E2E attestation has an invalid execution cell");
  }
  return {
    browser,
    ...(typeof imageId === "string" ? { imageId } : {}),
    ...(typeof preparerImageId === "string" ? { preparerImageId } : {}),
    target,
  };
};

const sameAttestationCell = (
  actual: E2EAttestationCell,
  expected: E2EAttestationCell,
): boolean =>
  actual.browser === expected.browser &&
  actual.imageId === expected.imageId &&
  actual.preparerImageId === expected.preparerImageId &&
  actual.target === expected.target;

export const validateE2EAttestationCells = (
  cells: unknown,
  selection: E2EExecutionSelection,
  images: E2EReleaseImageIds = {},
): E2EAttestationCell[] => {
  if (!Array.isArray(cells)) {
    throw new Error("E2E attestation has an invalid execution cell list");
  }
  const actualCells = cells.map(parseAttestationCell);
  const expectedCells = attestationCellsForSelection(selection, images);
  if (
    actualCells.length !== expectedCells.length ||
    expectedCells.some(
      (expected) =>
        !actualCells.some((actual) => sameAttestationCell(actual, expected)),
    )
  ) {
    throw new Error(attestationValidationError);
  }
  return actualCells;
};

export const cellsForE2ESelection = (
  selection: E2EExecutionSelection,
  lease: TestServiceLease,
  images: E2EReleaseImageIds = {},
): ExecutionCellInput[] =>
  selectE2EExecutionCells(selection).map((cell): ExecutionCellInput => {
    if (cell.target === "dev") return { ...cell, lease };
    if (cell.target === "standalone") {
      return { ...cell, imageId: assertStandaloneImage(images), lease };
    }
    const runtimeImages = assertRuntimeImages(images);
    return {
      ...cell,
      imageId: runtimeImages.runtimeImageId,
      lease,
      preparerImageId: runtimeImages.standaloneImageId,
    };
  });
