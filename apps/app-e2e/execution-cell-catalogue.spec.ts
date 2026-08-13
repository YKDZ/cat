import { describe, expect, it } from "vitest";

import {
  attestationCellsForSelection,
  cellsForE2ESelection,
  selectE2EExecutionCells,
  type E2EReleaseImageIds,
} from "./execution-cell-catalogue.ts";

const lease = {} as Parameters<typeof cellsForE2ESelection>[1];
const standaloneImageId = `sha256:${"a".repeat(64)}`;
const runtimeImageId = `sha256:${"b".repeat(64)}`;
const releaseImages: E2EReleaseImageIds = {
  releaseIdentity: "release-a",
  runtimeImageId,
  standaloneImageId,
};

describe("E2E execution cell catalogue", () => {
  it("returns the complete supported five-cell matrix", () => {
    expect(selectE2EExecutionCells({ target: "all" })).toEqual([
      { browser: "chromium", target: "dev" },
      { browser: "chromium", target: "standalone" },
      { browser: "firefox", target: "standalone" },
      { browser: "chromium", target: "runtime" },
      { browser: "firefox", target: "runtime" },
    ]);
  });

  it.each([
    [
      { target: "all", browser: "chromium" },
      [
        { browser: "chromium", target: "dev" },
        { browser: "chromium", target: "standalone" },
        { browser: "chromium", target: "runtime" },
      ],
    ],
    [
      { target: "all", browser: "firefox" },
      [
        { browser: "firefox", target: "standalone" },
        { browser: "firefox", target: "runtime" },
      ],
    ],
    [{ target: "dev" }, [{ browser: "chromium", target: "dev" }]],
    [
      { target: "dev", browser: "chromium" },
      [{ browser: "chromium", target: "dev" }],
    ],
    [
      { target: "standalone" },
      [
        { browser: "chromium", target: "standalone" },
        { browser: "firefox", target: "standalone" },
      ],
    ],
    [
      { target: "standalone", browser: "chromium" },
      [{ browser: "chromium", target: "standalone" }],
    ],
    [
      { target: "standalone", browser: "firefox" },
      [{ browser: "firefox", target: "standalone" }],
    ],
    [
      { target: "runtime" },
      [
        { browser: "chromium", target: "runtime" },
        { browser: "firefox", target: "runtime" },
      ],
    ],
    [
      { target: "runtime", browser: "chromium" },
      [{ browser: "chromium", target: "runtime" }],
    ],
    [
      { target: "runtime", browser: "firefox" },
      [{ browser: "firefox", target: "runtime" }],
    ],
  ] as const)("resolves supported focus %#", (selection, expectedCells) => {
    expect(selectE2EExecutionCells(selection)).toEqual(expectedCells);
  });

  it("rejects an unsupported Dev Firefox focus before service setup", () => {
    expect(() =>
      selectE2EExecutionCells({ browser: "firefox", target: "dev" }),
    ).toThrow("Development E2E supports Chromium only");
  });

  it("requires immutable release images when materializing release cells", () => {
    expect(() => cellsForE2ESelection({ target: "standalone" }, lease)).toThrow(
      "Standalone selection did not resolve an immutable image ID",
    );
    expect(() =>
      cellsForE2ESelection({ target: "runtime" }, lease, {
        runtimeImageId,
      }),
    ).toThrow("runtime and standalone preparer image IDs");
  });

  it("derives attestation cells and executable cells from the same selection", () => {
    const expected = attestationCellsForSelection(
      { target: "all" },
      releaseImages,
    );

    expect(
      cellsForE2ESelection({ target: "all" }, lease, releaseImages),
    ).toEqual(expected.map((cell) => ({ ...cell, lease })));
  });
});
