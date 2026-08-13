import { describe, expect, it } from "vitest";

import { invokeOperationContract, OperationContractError } from "./catalog.ts";
import {
  GlossaryTermWriteInputSchema,
  GlossaryTermWriteOutputSchema,
} from "./glossary-term-write.ts";
import { glossaryTermWriteContract } from "./glossary-term-write.ts";

describe("GlossaryTermWrite contract schemas", () => {
  it("accepts business identity and branch identity without trusted VCS tuple fields", () => {
    const input = GlossaryTermWriteInputSchema.parse({
      glossaryId: "1ef95ac4-5100-42e9-a98b-6142539bc0ea",
      termsData: [],
      operation: "DIRECT_WRITE",
      projectId: "2ef95ac4-5100-42e9-a98b-6142539bc0ea",
      branchId: 42,
    });

    expect(input.branchId).toBe(42);
    expect(
      GlossaryTermWriteInputSchema.safeParse({
        ...input,
        branchChangesetId: 7,
      }).success,
    ).toBe(false);
    expect(GlossaryTermWriteOutputSchema.parse({ derivations: [] })).toEqual({
      derivations: [],
    });
  });

  it("normalizes non-positive branch input before implementation", async () => {
    await expect(
      invokeOperationContract(glossaryTermWriteContract, undefined as never, {
        glossaryId: "1ef95ac4-5100-42e9-a98b-6142539bc0ea",
        termsData: [],
        operation: "DIRECT_WRITE",
        branchId: 0,
      }),
    ).rejects.toMatchObject({
      name: OperationContractError.name,
      identifier: "invalid_input",
      message: "Invalid operation input",
    });
  });
});
