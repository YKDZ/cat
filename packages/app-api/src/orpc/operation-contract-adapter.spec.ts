import { describe, expect, it } from "vitest";

import { OperationContractError } from "#/operation-contracts/index.ts";

import { projectOperationContractErrorToORPC } from "./operation-contract-adapter.ts";

describe("projectOperationContractErrorToORPC", () => {
  it("projects normalized invalid contract input as BAD_REQUEST", () => {
    expect(() =>
      projectOperationContractErrorToORPC(
        new OperationContractError("invalid_input", "Invalid operation input"),
      ),
    ).toThrow(expect.objectContaining({ code: "BAD_REQUEST" }));
  });
});
