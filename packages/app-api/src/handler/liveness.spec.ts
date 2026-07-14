import { afterEach, describe, expect, it } from "vitest";

import app from "../app.ts";

describe("liveness handler", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "inited");
  });

  it("responds without consulting runtime initialization or external dependencies", async () => {
    Reflect.set(globalThis, "inited", false);

    const response = await app.request("http://localhost/_health/live");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "live" });
  });
});
