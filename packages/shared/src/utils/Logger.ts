import pino from "pino";

export type Situation =
  | "PLUGIN"
  | "RPC"
  | "WEB"
  | "PROCESSER"
  | "DB"
  | "SERVER";

export interface LoggerOptions {
  level?: pino.Level;
  filterKeywords?: string[];
}

export class Logger {
  private pinoLogger: pino.Logger;
  private filterKeywords: Set<string>;

  constructor(options: LoggerOptions = {}) {
    this.filterKeywords = new Set(
      (options.filterKeywords ?? []).map((k) => k.toLowerCase()),
    );

    this.pinoLogger = pino({
      level: options.level ?? "error",
    });
  }

  public addFilterKeywords(...keywords: string[]) {
    keywords.forEach((k) => this.filterKeywords.add(k.toLowerCase()));
  }

  public removeFilterKeywords(...keywords: string[]) {
    keywords.forEach((k) => this.filterKeywords.delete(k.toLowerCase()));
  }

  private shouldLog(msg: string): boolean {
    if (!this.filterKeywords.size) return true;
    const text = msg.toLowerCase();
    for (const kw of this.filterKeywords) {
      if (text.includes(kw)) return false;
    }
    return true;
  }

  public debug(situation: Situation, msg: string, ...args: unknown[]) {
    if (!this.shouldLog(msg)) return;
    this.pinoLogger.debug({ situation }, msg, ...args);
  }

  public info(situation: Situation, msg: string, ...args: unknown[]) {
    if (!this.shouldLog(msg)) return;
    this.pinoLogger.info({ situation }, msg, ...args);
  }

  public warn(situation: Situation, msg: string, ...args: unknown[]) {
    if (!this.shouldLog(msg)) return;
    this.pinoLogger.warn({ situation }, msg, ...args);
  }

  public error(
    situation: Situation,
    msg: string,
    error: unknown,
    ...args: unknown[]
  ) {
    if (!this.shouldLog(msg)) return;

    const errorInfo =
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : Array.isArray(error)
          ? { arrayError: error }
          : typeof error === "object"
            ? error
            : { raw: error };

    this.pinoLogger.error({ situation, ...errorInfo }, msg, ...args);
  }
}

export const logger = new Logger({
  level: "debug",
});
