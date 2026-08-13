import {
  Logger,
  type DiagnosticEvent,
  type DiagnosticTransport,
} from "@cat/shared";
import pino from "pino";

/** Keep Pino's numeric level distinct from the versioned diagnostic level. */
export const toPinoDiagnosticEnvelope = (
  event: DiagnosticEvent,
): Readonly<{ diagnostic: DiagnosticEvent }> => ({ diagnostic: event });

export const pinoInstance = pino({
  level: process.env.LOG_LEVEL || "info",
  ...(process.env.NODE_ENV === "production" ||
  process.env.CAT_DIAGNOSTIC_NDJSON === "true"
    ? {}
    : { transport: { target: "pino-pretty" } }),
});

class PinoTransport implements DiagnosticTransport {
  emit(event: DiagnosticEvent): void {
    pinoInstance[event.level](toPinoDiagnosticEnvelope(event), event.message);
  }
}

export const serverLogger = new Logger({ runtime: "server" }, [
  new PinoTransport(),
]);
