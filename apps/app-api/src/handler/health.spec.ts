import {
  initRuntimeState,
  resolveRuntimeProfile,
  type RuntimeState,
} from "@cat/domain";
import { afterEach, describe, expect, it } from "vitest";

import app from "./health";

const createRuntimeState = (): RuntimeState => ({
  profile: resolveRuntimeProfile({ NODE_ENV: "development" }),
  database: {
    backend: "postgres-server",
    searchLevel: "basic-db-runtime" as const,
    extensions: {
      vector: false,
      pg_trgm: false,
      rum: false,
      zhparser: false,
    },
    textSearchConfigs: {
      cat_zh_hans: false,
    },
    functions: {
      rum_ts_score: false,
    },
    disabledFeatures: ["pgvector" as const],
    warnings: ["database search capability degraded to basic-db-runtime"],
  },
  initializedAt: "2025-01-01T00:00:00.000Z",
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "__CAT_RUNTIME_STATE__");
  Reflect.deleteProperty(globalThis, "inited");
});

describe("health handler", () => {
  it("returns startup health with runtime summary before initialization completes", async () => {
    const runtime = createRuntimeState();
    initRuntimeState(runtime);
    Reflect.set(globalThis, "inited", false);

    const response = await app.request("http://localhost/");
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      status: "starting",
      runtime,
    });
  });

  it("returns ok health with runtime summary after initialization", async () => {
    const runtime = createRuntimeState();
    initRuntimeState(runtime);
    Reflect.set(globalThis, "inited", true);

    const response = await app.request("http://localhost/");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      runtime,
    });
  });
});
