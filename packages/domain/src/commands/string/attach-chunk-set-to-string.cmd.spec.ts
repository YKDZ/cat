import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DbHandle } from "#/types.ts";

import { attachChunkSetToString } from "./attach-chunk-set-to-string.cmd.ts";

describe("attachChunkSetToString", () => {
  const update = vi.fn();
  const set = vi.fn();
  const where = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    update.mockReturnValue({ set });
    set.mockReturnValue({ where });
  });

  it("batches per-string chunk set assignments into one update", async () => {
    where.mockResolvedValueOnce(undefined);

    await attachChunkSetToString(
      { db: { update } as unknown as DbHandle },
      {
        updates: [
          { stringId: 1, chunkSetId: 11 },
          { stringId: 2, chunkSetId: 22 },
        ],
      },
    );

    expect(update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
  });

  it("does not issue an update for empty input", async () => {
    await attachChunkSetToString(
      { db: { update } as unknown as DbHandle },
      { updates: [] },
    );

    expect(update).not.toHaveBeenCalled();
  });

  it("rejects duplicate string IDs before writing", async () => {
    const execution = attachChunkSetToString(
      { db: { update } as unknown as DbHandle },
      {
        updates: [
          { stringId: 1, chunkSetId: 11 },
          { stringId: 1, chunkSetId: 22 },
        ],
      },
    );

    await expect(execution).rejects.toMatchObject({
      issues: [
        expect.objectContaining({
          message: "Duplicate stringId 1.",
          path: ["updates", 1, "stringId"],
        }),
      ],
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects non-positive IDs and unknown fields before writing", async () => {
    await expect(
      attachChunkSetToString({ db: { update } as unknown as DbHandle }, {
        updates: [{ stringId: 0, chunkSetId: -1, extra: true }],
      } as never),
    ).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });
});
