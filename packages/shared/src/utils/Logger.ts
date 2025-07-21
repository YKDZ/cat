export enum LogLevel {
  DEBUG = 10,
  INFO = 20,
  WARN = 30,
  ERROR = 40,
  OFF = 50,
}

export type Situation =
  | "PLUGIN"
  | "RPC"
  | "WEB"
  | "PROCESSER"
  | "DB"
  | "SERVER";

export interface LoggerOptions {
  level?: LogLevel;
  filterKeywords?: string[];
  outputFn?: (...args: unknown[]) => void;
}

export class Logger {
  private level: LogLevel;
  private filterKeywords: Set<string>;
  private outputFn: (...args: unknown[]) => void;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? LogLevel.DEBUG;
    this.filterKeywords = new Set(
      (options.filterKeywords ?? []).map((k) => k.toLowerCase()),
    );
    this.outputFn = options.outputFn ?? console.log.bind(console);
  }

  public setLevel(level: LogLevel) {
    this.level = level;
  }

  public addFilterKeywords(...keywords: string[]) {
    keywords.forEach((k) => this.filterKeywords.add(k.toLowerCase()));
  }

  public removeFilterKeywords(...keywords: string[]) {
    keywords.forEach((k) => this.filterKeywords.delete(k.toLowerCase()));
  }

  private shouldLog(level: LogLevel, msg: string): boolean {
    if (level < this.level) return false;
    if (!this.filterKeywords.size) return true;
    const text = msg.toLowerCase();
    for (const kw of this.filterKeywords) {
      if (text.includes(kw)) {
        return false;
      }
    }
    return true;
  }

  private format(situation: Situation, level: LogLevel, msg: string): string {
    const ts = new Date().toISOString();
    const lvl = LogLevel[level];
    return `[${ts}] [${lvl}] [${situation.toLocaleString()}] ${msg}`;
  }

  public debug(situation: Situation, msg: string, ...args: unknown[]) {
    if (this.shouldLog(LogLevel.DEBUG, msg)) {
      this.outputFn(this.format(situation, LogLevel.DEBUG, msg), ...args);
    }
  }

  public info(situation: Situation, msg: string, ...args: unknown[]) {
    if (this.shouldLog(LogLevel.INFO, msg)) {
      this.outputFn(this.format(situation, LogLevel.INFO, msg), ...args);
    }
  }

  public warn(situation: Situation, msg: string, ...args: unknown[]) {
    if (this.shouldLog(LogLevel.WARN, msg)) {
      this.outputFn(this.format(situation, LogLevel.WARN, msg), ...args);
    }
  }

  public error(
    situation: Situation,
    msg: string,
    error: unknown,
    ...args: unknown[]
  ) {
    if (this.shouldLog(LogLevel.ERROR, msg)) {
      const prefix = this.format(situation, LogLevel.ERROR, msg);

      let errorInfo: string;
      if (error instanceof Error) {
        errorInfo = `${error.message}\n${error.stack}`;
      } else if (Array.isArray(error)) {
        errorInfo = error.join("\n");
      } else {
        try {
          errorInfo = JSON.stringify(error, null, 2);
        } catch {
          errorInfo = String(error);
        }
      }

      this.outputFn(prefix, "\n" + errorInfo, ...args);
    }
  }
}

export const logger = new Logger();
