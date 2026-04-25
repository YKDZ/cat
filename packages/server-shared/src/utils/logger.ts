import { Logger, type LoggerTransport, type LogEntry } from "@cat/shared";
import pino from "pino";

export const pinoInstance = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty" }
      : undefined,
});

class PinoTransport implements LoggerTransport {
  log(entry: LogEntry) {
    const { level, message, payload, error, situation } = entry;
    // Flatten payload and map map error to pino's standard "err" field
    const logData = { situation, ...payload, err: error };
    pinoInstance[level](logData, message);
  }
}

export const serverLogger = new Logger("SERVER", [new PinoTransport()]);
