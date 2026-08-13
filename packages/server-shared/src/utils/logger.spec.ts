import { PassThrough } from "node:stream";

import type { DiagnosticEvent } from "@cat/shared";
import pino from "pino";
import { describe, expect, it } from "vitest";

import { toPinoDiagnosticEnvelope } from "./logger.ts";

describe("server diagnostic transport", () => {
  it("serializes the diagnostic under an envelope without replacing Pino's level", () => {
    const output = new PassThrough();
    let raw = "";
    output.setEncoding("utf8");
    output.on("data", (chunk: string) => {
      raw += chunk;
    });
    const event: DiagnosticEvent = {
      code: "DATABASE_UNAVAILABLE",
      context: { runtime: "server" },
      fields: {},
      level: "error",
      message: "Database is unavailable",
      timestamp: "2026-07-14T00:00:00.000Z",
      version: 1,
    };

    pino({ level: "debug" }, output).error(
      toPinoDiagnosticEnvelope(event),
      event.message,
    );

    const record: unknown = JSON.parse(raw);
    expect(record).toMatchObject({
      diagnostic: event,
      level: expect.any(Number),
      msg: event.message,
    });
  });
});
