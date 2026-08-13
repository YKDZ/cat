import { describe, expect, it } from "vitest";

import { invokeOperationContract, OperationContractError } from "./catalog.ts";
import {
  glossaryRecallRebuildContract,
  GlossaryRecallRebuildInputSchema,
  GlossaryRecallRebuildOutputSchema,
} from "./glossary-recall-rebuild.ts";

const input = {
  glossaryId: "1ef95ac4-5100-42e9-a98b-6142539bc0ea",
  projectId: "2ef95ac4-5100-42e9-a98b-6142539bc0ea",
};

describe("Glossary recall rebuild contract schemas", () => {
  it("accepts only canonical glossary and project identity", () => {
    expect(GlossaryRecallRebuildInputSchema.parse(input)).toEqual(input);
    for (const forbidden of [
      "branchId",
      "branchChangesetId",
      "references",
      "changesetId",
    ]) {
      expect(
        GlossaryRecallRebuildInputSchema.safeParse({
          ...input,
          [forbidden]: forbidden === "references" ? [] : 1,
        }).success,
      ).toBe(false);
    }
    expect(
      GlossaryRecallRebuildOutputSchema.parse({ status: "NO_WORK" }),
    ).toEqual({
      status: "NO_WORK",
    });
  });

  it("rejects invalid inputs before authorization or execution", async () => {
    await expect(
      invokeOperationContract(
        glossaryRecallRebuildContract,
        undefined as never,
        {
          glossaryId: input.glossaryId,
        },
      ),
    ).rejects.toMatchObject({
      identifier: "invalid_input",
      message: "Invalid operation input",
      name: OperationContractError.name,
    });
  });
});
