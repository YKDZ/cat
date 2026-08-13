import { describe, expect, it } from "vitest";

import { requireWorkflowDatabase } from "./database-context.ts";

describe("requireWorkflowDatabase", () => {
  it("hard-fails when a workflow runtime was not given a database", () => {
    expect(() => requireWorkflowDatabase({})).toThrow(
      "Workflow runtime database is not configured.",
    );
  });
});
