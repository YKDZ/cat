import type {
  DiagnosticContext,
  DiagnosticEvent,
  DiagnosticFields,
  DiagnosticObserver,
  DiagnosticTransport,
  LogLevel,
} from "#/utils/logger/types.ts";

const REDACTED = "[REDACTED]";
const SENSITIVE_FIELD =
  /(?:authorization|cookie|password|secret|token|api[-_]?key|credential)/i;
const EVENT_CODE = /^[A-Z][A-Z0-9_]*$/;
const SENSITIVE_TEXT =
  /(["']?(?:authorization|cookie|password|secret|token|api[-_]?key|credential)["']?)(\s*[:=]\s*)(?:Bearer\s+[^\s,;}&]+|"[^"]*"|'[^']*'|[^\s,;}&]+)/gi;
const BEARER_TOKEN = /\bBearer\s+[^\s,;}&]+/gi;

type LoggerState = {
  readonly transports: readonly DiagnosticTransport[];
  readonly observers: Set<DiagnosticObserver>;
};

type BrowserDiagnosticTarget = {
  dispatchEvent: (event: unknown) => boolean;
};

type CustomEventConstructor = new (
  type: string,
  init: { detail: DiagnosticEvent },
) => unknown;

const isBrowserDiagnosticTarget = (
  value: unknown,
): value is BrowserDiagnosticTarget =>
  typeof value === "object" &&
  value !== null &&
  typeof Reflect.get(value, "dispatchEvent") === "function";

const isCustomEventConstructor = (
  value: unknown,
): value is CustomEventConstructor => typeof value === "function";

const redactText = (value: string): string =>
  value
    .replace(
      SENSITIVE_TEXT,
      (_match, key: string, separator: string) =>
        `${key}${separator}${REDACTED}`,
    )
    .replace(BEARER_TOKEN, `Bearer ${REDACTED}`);

const normalizeValue = (
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): unknown => {
  if (value instanceof Error) {
    const cause = Reflect.get(value, "cause");
    return {
      ...(cause === undefined ? {} : { cause: normalizeValue(cause, seen) }),
      name: redactText(value.name),
      message: redactText(value.message),
    };
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return typeof value === "string" ? redactText(value) : value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "undefined") return undefined;
  if (typeof value === "symbol" || typeof value === "function") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value))
    return value.map((item) => normalizeValue(item, seen));
  if (typeof value === "object") {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    const normalized: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      normalized[key] = SENSITIVE_FIELD.test(key)
        ? REDACTED
        : normalizeValue(child, seen);
    }
    return normalized;
  }
  return "[UNSUPPORTED]";
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
};

const normalizeFields = (
  fields: DiagnosticFields,
): Readonly<Record<string, unknown>> => {
  const normalized = normalizeValue(fields);
  return deepFreeze(isRecord(normalized) ? normalized : {});
};

const normalizeContext = (context: DiagnosticContext): DiagnosticContext =>
  normalizeFields(context);

const deliver = (recipient: () => void | Promise<void>): void => {
  try {
    void Promise.resolve(recipient()).catch(() => undefined);
  } catch {
    // Diagnostics must never alter application behavior.
  }
};

/**
 * Logs immutable, normalized diagnostic events to independent transports.
 * Observers are opt-in and intentionally have no effect on application flow.
 */
export class Logger {
  public readonly context: DiagnosticContext;
  private readonly state: LoggerState;

  public constructor(
    context: DiagnosticContext = {},
    transports: readonly DiagnosticTransport[] = [],
    state?: LoggerState,
  ) {
    this.context = normalizeContext(context);
    this.state = state ?? { transports: [...transports], observers: new Set() };
  }

  public child(context: DiagnosticContext): Logger {
    return new Logger({ ...this.context, ...context }, [], this.state);
  }

  public observe(observer: DiagnosticObserver): () => void {
    this.state.observers.add(observer);
    return () => {
      this.state.observers.delete(observer);
    };
  }

  public debug(message: string, fields: DiagnosticFields = {}): void {
    this.emit("debug", message, fields);
  }

  public info(message: string, fields: DiagnosticFields = {}): void {
    this.emit("info", message, fields);
  }

  public warn(message: string, fields: DiagnosticFields = {}): void {
    this.emit("warn", message, fields);
  }

  public error(message: string, fields: DiagnosticFields = {}): void {
    this.emit("error", message, fields);
  }

  public fatal(message: string, fields: DiagnosticFields = {}): void {
    this.emit("fatal", message, fields);
  }

  private emit(
    level: LogLevel,
    message: string,
    fields: DiagnosticFields,
  ): void {
    const { code, ...eventFields } = fields;
    const event: DiagnosticEvent = Object.freeze({
      version: 1,
      code:
        typeof code === "string" && EVENT_CODE.test(code)
          ? code
          : `CAT_${level.toUpperCase()}`,
      level,
      message: redactText(message),
      context: this.context,
      fields: normalizeFields(eventFields),
      timestamp: new Date().toISOString(),
    });

    for (const transport of this.state.transports) {
      deliver(() => transport.emit(event));
    }
    for (const observer of this.state.observers) {
      deliver(() => observer(event));
    }
    const browserWindow = Reflect.get(globalThis, "window");
    const customEvent = Reflect.get(globalThis, "CustomEvent");
    if (
      isBrowserDiagnosticTarget(browserWindow) &&
      isCustomEventConstructor(customEvent)
    ) {
      deliver(() => {
        browserWindow.dispatchEvent(
          new customEvent("cat:diagnostic", { detail: event }),
        );
      });
    }
  }
}

export const logger = new Logger({ service: "cat" });
