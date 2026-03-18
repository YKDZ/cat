export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";
export type OutputSituation =
  | "ROUTER"
  | "PLUGIN"
  | "CACHE"
  | "DB"
  | "AGENT"
  | "APP"
  | "RPC"
  | "WEB"
  | "WORKER"
  | "OP"
  | "SERVER"
  | string;

export interface LogEntry<T = Record<string, unknown>> {
  level: LogLevel;
  situation: OutputSituation;
  message: string;
  payload?: T;
  error?: Error | unknown;
  timestamp: Date;
}

export interface LoggerTransport {
  log(entry: LogEntry): void;
}
