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
  /(?:authorization|cookie|password|secret|token|api[-_]?key|credential|session(?:[-_]?id)?|csrf(?:[-_]?token)?)/i;
const EVENT_CODE = /^[A-Z][A-Z0-9_]*$/;
const SENSITIVE_TEXT =
  /(["']?(?:authorization|cookie|password|secret|token|api[-_]?key|credential|session(?:[-_]?id)?|csrf(?:[-_]?token)?)["']?)(\s*[:=]\s*)(?:Bearer\s+[^\s,;}&]+|"[^"]*"|'[^']*'|[^\s,;}&]+)/gi;
const BEARER_TOKEN = /\bBearer\s+[^\s,;}&]+/gi;
const URL_USERINFO =
  /([a-z][a-z\d+.-]*:\/\/)(?:[^\s/@:?#]*:[^\s/@?#]*|[^\s/@:?#]+)@/gi;

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

/** Redacts credentials before diagnostic text crosses a process boundary. */
export const redactDiagnosticText = (value: string): string =>
  value
    .replace(URL_USERINFO, `$1${REDACTED}@`)
    .replace(
      SENSITIVE_TEXT,
      (_match, key: string, separator: string) =>
        `${key}${separator}${REDACTED}`,
    )
    .replace(BEARER_TOKEN, `Bearer ${REDACTED}`);

const diagnosticErrorTreeLimits = {
  childrenPerNode: 16,
  depth: 8,
  nodes: 64,
} as const;

const diagnosticErrorChildren = (error: unknown): readonly unknown[] => {
  try {
    if (error instanceof AggregateError) return error.errors;
    if (error instanceof Error && error.cause !== undefined) {
      return [error.cause];
    }
  } catch {
    return [];
  }
  return [];
};

export type DiagnosticErrorTreeAnnotationResolver = (
  error: unknown,
  inheritedAnnotation: string | undefined,
) => string | undefined;

export type FormatDiagnosticErrorTreeOptions = {
  resolveAnnotation?: DiagnosticErrorTreeAnnotationResolver;
};

/** Formats bounded, recursively expanded, redacted failure diagnostics. */
export const formatDiagnosticErrorTree = (
  error: unknown,
  options: FormatDiagnosticErrorTreeOptions = {},
): string => {
  const seen = new WeakSet<object>();
  let remainingNodes = diagnosticErrorTreeLimits.nodes;
  const format = (
    current: unknown,
    depth: number,
    inheritedAnnotation: string | undefined,
  ): string => {
    if (remainingNodes <= 0) return "failure-tree-truncated=nodes";
    remainingNodes -= 1;
    if (typeof current === "object" && current !== null) {
      if (seen.has(current)) return "failure-tree-cycle";
      seen.add(current);
    }
    let message: string;
    try {
      message = redactDiagnosticText(
        current instanceof Error ? current.message : String(current),
      );
    } catch {
      message = "[unavailable error details]";
    }
    let annotation = inheritedAnnotation;
    try {
      annotation =
        options.resolveAnnotation?.(current, inheritedAnnotation) ??
        inheritedAnnotation;
    } catch {
      annotation = inheritedAnnotation;
    }
    const parts = [
      `${annotation === undefined ? "" : `${redactDiagnosticText(annotation)} `}error=${message}`,
    ];
    if (depth >= diagnosticErrorTreeLimits.depth) {
      parts.push("failure-tree-truncated=depth");
      return parts.join("; ");
    }
    const children = diagnosticErrorChildren(current);
    for (const child of children.slice(
      0,
      diagnosticErrorTreeLimits.childrenPerNode,
    )) {
      parts.push(format(child, depth + 1, annotation));
    }
    if (children.length > diagnosticErrorTreeLimits.childrenPerNode) {
      parts.push("failure-tree-truncated=children");
    }
    return parts.join("; ");
  };
  return format(error, 0, undefined);
};

const normalizeValue = (
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): unknown => {
  if (value instanceof Error) {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    const cause = Reflect.get(value, "cause");
    return {
      ...(cause === undefined ? {} : { cause: normalizeValue(cause, seen) }),
      name: redactDiagnosticText(value.name),
      message: redactDiagnosticText(value.message),
    };
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return typeof value === "string" ? redactDiagnosticText(value) : value;
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
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    return value.map((item) => normalizeValue(item, seen));
  }
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

const deepFreeze = <T>(value: T, seen: WeakSet<object> = new WeakSet()): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    if (seen.has(value)) return value;
    seen.add(value);
    for (const child of Object.values(value)) {
      deepFreeze(child, seen);
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
      message: redactDiagnosticText(message),
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
