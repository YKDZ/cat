import { describe, expect, it, vi } from "vitest";

import { assertReleaseE2eImage } from "./release-e2e-image.ts";

const imageId = `sha256:${"a".repeat(64)}`;

describe("release E2E image input", () => {
  it("attests an explicit existing immutable ID against the requested target capability", async () => {
    const run = vi.fn(async () => ({
      stdout: JSON.stringify({
        Config: {
          Cmd: ["prepare-and-start"],
          Labels: {
            "org.opencontainers.image.description":
              "CAT standalone application with database preparation",
            "org.opencontainers.image.version": "release-20260714",
          },
        },
        Id: imageId,
      }),
    }));

    await expect(
      assertReleaseE2eImage({
        imageId,
        target: "standalone",
        env: {},
        run,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      imageId,
      releaseIdentity: "release-20260714",
      target: "standalone",
    });
  });

  it.each([
    undefined,
    "cat:latest",
    "sha256:short",
    "sha256:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ab",
  ])(
    "fails closed before Docker for a missing or mutable image reference",
    async (candidate) => {
      const run = vi.fn();

      await expect(
        assertReleaseE2eImage({
          imageId: candidate,
          target: "runtime",
          env: {},
          run,
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow("explicit immutable local image ID");
      expect(run).not.toHaveBeenCalled();
    },
  );

  it("does not build or discover tags when the explicit ID does not exist", async () => {
    const run = vi.fn(async () => {
      throw new Error("No such image");
    });

    await expect(
      assertReleaseE2eImage({
        imageId,
        target: "runtime",
        env: {},
        run,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("does not exist locally");
    expect(vi.mocked(run).mock.calls).toEqual([
      [
        "docker",
        ["image", "inspect", "--format", "{{json .}}", imageId],
        expect.objectContaining({ stdio: "pipe" }),
      ],
    ]);
  });

  it("rejects an image whose requested target capability does not match", async () => {
    const run = vi.fn(async () => ({
      stdout: JSON.stringify({
        Config: {
          Cmd: ["prepare-and-start"],
          Labels: {
            "org.opencontainers.image.description":
              "CAT standalone application with database preparation",
            "org.opencontainers.image.version": "release-20260714",
          },
        },
        Id: imageId,
      }),
    }));

    await expect(
      assertReleaseE2eImage({
        imageId,
        target: "runtime",
        env: {},
        run,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("does not satisfy the runtime capability");
  });

  it("rejects an otherwise capable image without release provenance", async () => {
    const run = vi.fn(async () => ({
      stdout: JSON.stringify({
        Config: {
          Cmd: ["start-only"],
          Labels: {
            "org.opencontainers.image.description":
              "CAT start-only application runtime",
          },
        },
        Id: imageId,
      }),
    }));

    await expect(
      assertReleaseE2eImage({
        imageId,
        target: "runtime",
        env: {},
        run,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("does not satisfy the runtime capability");
  });
});
