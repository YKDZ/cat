import { describe, expect, test } from "vitest";

import { assertExpectedRevision, transitionTaskStatus } from "./task-state.ts";
describe("Task state machine", () => {
  test("requires CAS and an owner cancel confirmation", () => {
    expect(transitionTaskStatus("RUNNING", "bindRun")).toBe("RUNNING");
    expect(transitionTaskStatus("RUNNING", "requestCancel")).toBe(
      "CANCEL_REQUESTED",
    );
    expect(transitionTaskStatus("CANCEL_REQUESTED", "confirmCancel")).toBe(
      "CANCELED",
    );
    expect(transitionTaskStatus("CANCEL_REQUESTED", "complete")).toBe(
      "COMPLETED",
    );
    expect(() => assertExpectedRevision(2, 1)).toThrow();
  });
});
