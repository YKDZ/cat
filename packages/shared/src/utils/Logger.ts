import pino from "pino";

const situations = [
  "PLUGIN",
  "RPC",
  "WEB",
  "PROCESSOR",
  "DB",
  "SERVER",
] as const;

export type Situation =
  | "PLUGIN"
  | "RPC"
  | "WEB"
  | "PROCESSOR"
  | "DB"
  | "SERVER";

export interface LoggerOptions {
  level?: pino.Level;
}

export class Logger {
  public baseLogger: pino.Logger;

  constructor(options: LoggerOptions = {}) {
    this.baseLogger = pino({
      level: options.level || "info",
    });
  }

  public debug(
    situation: Situation,
    obj: object,
    msg?: string,
    ...args: unknown[]
  ) {
    if (!msg) this.baseLogger.debug({ ...obj, situation });
    else this.baseLogger.debug({ ...obj, situation }, msg, ...args);
  }

  public info(
    situation: Situation,
    obj: object,
    msg?: string,
    ...args: unknown[]
  ) {
    if (!msg) this.baseLogger.info({ ...obj, situation });
    else this.baseLogger.info({ ...obj, situation }, msg, ...args);
  }

  public warn(
    situation: Situation,
    obj: object,
    msg?: string,
    ...args: unknown[]
  ) {
    if (!msg) this.baseLogger.warn({ ...obj, situation });
    else this.baseLogger.warn({ ...obj, situation }, msg, ...args);
  }

  public error(
    situation: Situation,
    obj: object,
    error: unknown,
    msg?: string,
    ...args: unknown[]
  ) {
    if (!msg) this.baseLogger.error({ ...obj, situation, error });
    else this.baseLogger.error({ error, situation, ...obj }, msg, ...args);
  }
}

export const logger = new Logger({
  level: "debug",
});
