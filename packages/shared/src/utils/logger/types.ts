export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";
export type OutputSituation = string;

export interface LogEntry<T = Record<string, unknown>> {
  level: LogLevel;
  situation: OutputSituation;
  message: string;
  payload?: T;
  error?: unknown;
  timestamp: Date;
}

export interface LoggerTransport {
  log(entry: LogEntry): void;
}
