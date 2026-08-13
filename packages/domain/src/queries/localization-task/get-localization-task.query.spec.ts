import { describe, expect, test } from "vitest";

import { canReadTaskScope } from "./get-localization-task.query.ts";

const viewerAuthorization = {
  viewerId: "6766afda-1dc4-4f3d-b7db-6d97857d082e",
  authorizedProjectIds: [],
  systemAdmin: false,
};

describe("task relationship authorization", () => {
  test("does not expose a project task without a project relationship", () => {
    expect(
      canReadTaskScope(
        { type: "PROJECT", id: "6b0feabf-859e-43db-84b1-b9d7a221279a" },
        viewerAuthorization,
      ),
    ).toBe(false);
    expect(
      canReadTaskScope(
        { type: "PROJECT", id: "6b0feabf-859e-43db-84b1-b9d7a221279a" },
        {
          ...viewerAuthorization,
          authorizedProjectIds: ["6b0feabf-859e-43db-84b1-b9d7a221279a"],
        },
      ),
    ).toBe(true);
  });

  test("limits user-scoped tasks to the scoped user unless the viewer is a system administrator", () => {
    expect(
      canReadTaskScope(
        { type: "USER", id: "6b0feabf-859e-43db-84b1-b9d7a221279a" },
        viewerAuthorization,
      ),
    ).toBe(false);
  });

  test("does not grant project tasks through an affected resource and permits system administrators", () => {
    expect(
      canReadTaskScope(
        { type: "PROJECT", id: "6b0feabf-859e-43db-84b1-b9d7a221279a" },
        viewerAuthorization,
      ),
    ).toBe(false);
    expect(
      canReadTaskScope(
        { type: "INSTANCE", id: null },
        { ...viewerAuthorization, systemAdmin: true },
      ),
    ).toBe(true);
  });
});
