import { describe, expect, it } from "vitest";

import { createTrackedRequest } from "./request-cancellation.ts";

describe("tracked request cancellation", () => {
  it("aborts its own signal exactly once", () => {
    const request = createTrackedRequest();
    request.cancel();
    request.cancel();

    expect(request.signal.aborted).toBe(true);
  });
});
