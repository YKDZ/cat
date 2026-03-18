import type {
  LogLevel,
  OutputSituation,
  LogEntry,
  LoggerTransport,
} from "./types.ts";

export class Logger {
  constructor(
    public situation: OutputSituation,
    public transports: LoggerTransport[] = [],
  ) {}

  public addTransport(transport: LoggerTransport): void {
    this.transports.push(transport);
  }

  public withSituation(situation: OutputSituation): Logger {
    return new Logger(situation, this.transports);
  }

  public withType<
    TPayload extends Record<string, unknown>,
  >(): TypedLogger<TPayload> {
    return new TypedLogger<TPayload>(this);
  }

  public debug(message: string): void;
  public debug<T extends Record<string, unknown>>(
    payload: T,
    message?: string,
  ): void;
  public debug(...args: unknown[]): void {
    this.emit("debug", args);
  }

  public info(message: string): void;
  public info<T extends Record<string, unknown>>(
    payload: T,
    message?: string,
  ): void;
  public info(...args: unknown[]): void {
    this.emit("info", args);
  }

  public warn(message: string): void;
  public warn<T extends Record<string, unknown>>(
    payload: T,
    message?: string,
  ): void;
  public warn(...args: unknown[]): void {
    this.emit("warn", args);
  }

  public fatal(message: string): void;
  public fatal<T extends Record<string, unknown>>(
    payload: T,
    message?: string,
  ): void;
  public fatal(error: unknown, message?: string): void;
  public fatal<T extends Record<string, unknown>>(
    payload: T,
    error: unknown,
    message?: string,
  ): void;
  public fatal(...args: unknown[]): void {
    this.handleErrorLike("fatal", ...args);
  }

  public error(message: string): void;
  public error<T extends Record<string, unknown>>(
    payload: T,
    message?: string,
  ): void;
  public error(error: unknown, message?: string): void;
  public error<T extends Record<string, unknown>>(
    payload: T,
    error: unknown,
    message?: string,
  ): void;
  public error(...args: unknown[]): void {
    this.handleErrorLike("error", ...args);
  }

  private handleErrorLike(level: LogLevel, ...args: unknown[]): void {
    const timestamp = new Date();
    const entry: LogEntry = {
      level,
      situation: this.situation,
      timestamp,
      message: "",
    };

    let payload: Record<string, unknown> | undefined;
    let errOrMsg: unknown;
    let msg: string | undefined;

    if (args.length === 1) {
      errOrMsg = args[0];
    } else if (args.length === 2) {
      if (typeof args[0] === "string" || args[0] instanceof Error) {
        errOrMsg = args[0];
        msg = typeof args[1] === "string" ? args[1] : undefined;
      } else {
        // oxlint-disable-next-line no-unsafe-type-assertion -- overload signatures guarantee Record<string, unknown>
        payload = args[0] as Record<string, unknown>;
        errOrMsg = args[1];
      }
    } else {
      // oxlint-disable-next-line no-unsafe-type-assertion -- overload signatures guarantee Record<string, unknown>
      payload = args[0] as Record<string, unknown>;
      errOrMsg = args[1];
      msg = typeof args[2] === "string" ? args[2] : undefined;
    }

    entry.payload = payload;

    if (typeof errOrMsg === "string") {
      entry.error = new Error(errOrMsg);
      entry.message = msg ?? errOrMsg;
    } else if (errOrMsg instanceof Error) {
      entry.error = errOrMsg;
      entry.message = msg ?? errOrMsg.message;
    } else {
      entry.error = errOrMsg;
      entry.message = msg ?? "Unknown error";
    }

    this.transports.forEach((t) => {
      t.log(entry);
    });
  }

  private emit(level: LogLevel, args: unknown[]) {
    const timestamp = new Date();
    const entry: LogEntry = {
      level,
      situation: this.situation,
      timestamp,
      message: "",
    };

    if (level === "error" || level === "fatal") {
      entry.message = typeof args[0] === "string" ? args[0] : "Unknown error";
      entry.error = args[1];
    } else {
      if (typeof args[0] === "string") {
        entry.message = args[0];
      } else {
        // oxlint-disable-next-line no-unsafe-type-assertion -- overload signatures guarantee Record<string, unknown>
        entry.payload = args[0] as Record<string, unknown>;
        entry.message = typeof args[1] === "string" ? args[1] : "";
      }
    }

    this.transports.forEach((t) => {
      t.log(entry);
    });
  }
}

export class TypedLogger<T extends Record<string, unknown>> {
  constructor(private baseLogger: Logger) {}

  public debug(payload: T, message?: string): void {
    if (message === undefined) {
      this.baseLogger.debug(payload);
    } else {
      this.baseLogger.debug(payload, message);
    }
  }

  public info(payload: T, message?: string): void {
    if (message === undefined) {
      this.baseLogger.info(payload);
    } else {
      this.baseLogger.info(payload, message);
    }
  }

  public warn(payload: T, message?: string): void {
    if (message === undefined) {
      this.baseLogger.warn(payload);
    } else {
      this.baseLogger.warn(payload, message);
    }
  }

  public fatal(payload: T, error: unknown, message?: string): void {
    // Treat payload as part of the error context. We map it by passing through baseLogger.
    // For a cleaner TypedLogger support, we can reconstruct the entry by using a custom emit.
    let err = error;
    let msg = message;
    if (typeof error === "string") {
      err = new Error(error);
      msg = message ?? error;
    } else if (!msg && error instanceof Error) {
      msg = error.message;
    }

    const entry: LogEntry = {
      level: "fatal",
      situation: this.baseLogger.situation,
      timestamp: new Date(),
      message: msg || "Unknown error",
      payload,
      error: err,
    };
    this.baseLogger.transports.forEach((t) => {
      t.log(entry);
    });
  }

  public error(payload: T, error: unknown, message?: string): void {
    let err = error;
    let msg = message;
    if (typeof error === "string") {
      err = new Error(error);
      msg = message ?? error;
    } else if (!msg && error instanceof Error) {
      msg = error.message;
    }

    const entry: LogEntry = {
      level: "error",
      situation: this.baseLogger.situation,
      timestamp: new Date(),
      message: msg || "Unknown error",
      payload,
      error: err,
    };
    this.baseLogger.transports.forEach((t) => {
      t.log(entry);
    });
  }
}

export const logger = new Logger("APP");
