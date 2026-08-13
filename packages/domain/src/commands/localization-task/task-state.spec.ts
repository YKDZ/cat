import { describe, expect, test } from "vitest";

import { assertExpectedRevision, transitionTaskStatus } from "./task-state.ts";
describe("Task state machine", () => {
  test("exposes only product state transitions and requires CAS", () => {
    expect(transitionTaskStatus("PENDING", "start")).toBe("RUNNING");
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
    expect(() => transitionTaskStatus("PENDING", "progress")).toThrow();
  });
});
