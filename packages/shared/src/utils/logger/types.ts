export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export type DiagnosticContext = Readonly<Record<string, unknown>>;
export type DiagnosticFields = Readonly<Record<string, unknown>>;

/** Versioned event shared by browser, server, and plugin diagnostics. */
export type DiagnosticEvent = Readonly<{
  version: 1;
  code: string;
  level: LogLevel;
  message: string;
  context: DiagnosticContext;
  fields: DiagnosticFields;
  timestamp: string;
}>;

export type DiagnosticTransport = {
  emit: (event: DiagnosticEvent) => void | Promise<void>;
};

export type DiagnosticObserver = (
  event: DiagnosticEvent,
) => void | Promise<void>;
