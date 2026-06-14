import { ORPCError } from "@orpc/client";

/**
 * Semantic error report. Provides structured error context for agents and humans.
 */
export type SemanticError = {
  /** Error category */
  code: string;
  /** HTTP status code */
  status?: number;
  /** Human-readable error summary */
  message: string;
  /** The oRPC path that was called */
  path?: string;
  /** Structured error details (e.g., Zod validation issues) */
  details?: unknown;
  /** Suggestion for fixing the error */
  hint?: string;
};

/**
 * Simplified representation of a Zod v4 validation issue.
 */
type ZodIssue = {
  path: (string | number)[];
  message: string;
  code?: string;
  expected?: string;
  received?: string;
};

/**
 * Extract Zod validation issues from an oRPC error's data field.
 *
 * oRPC 服务端在 input 验证失败时会将 Zod issue 数组放入 data.issues 字段。
 */
const extractZodIssues = (data: unknown): ZodIssue[] | null => {
  if (!data || typeof data !== "object") return null;

  // oRPC wraps Zod issues in { issues: [...] }
  const candidate =
    "issues" in data ? (data as { issues: unknown }).issues : data;

  if (!Array.isArray(candidate)) return null;
  if (candidate.length === 0) return null;

  // Verify at least one item looks like a Zod issue
  const first: unknown = candidate[0];
  if (!first || typeof first !== "object" || !("message" in first)) {
    return null;
  }

  // validated above: every element has at least `message`
  // oxlint-disable-next-line no-unsafe-type-assertion
  return candidate as ZodIssue[];
};

/**
 * Generate a fix suggestion based on the error type.
 */
const generateHint = (
  code: string,
  status: number | undefined,
  context?: { path?: string },
): string => {
  switch (code) {
    case "UNAUTHORIZED":
      return "Check your API key: set --api-key or $CAT_API_KEY with a valid 'cat_...' key.";
    case "FORBIDDEN":
      return "Your API key lacks permission for this operation. Check scopes or resource ownership.";
    case "NOT_FOUND":
      return context?.path
        ? `Handler '${context.path}' was not found, or the referenced resource does not exist. Run 'cat-cli call --help' to see usage.`
        : "The requested resource does not exist.";
    case "BAD_REQUEST":
      return "The input does not match the expected schema. Check the 'details' field for specific validation errors.";
    case "INTERNAL_SERVER_ERROR":
      return "Server-side error. Check server logs for details.";
    default:
      if (status && status >= 400 && status < 500)
        return "Client error. Review your input parameters.";
      if (status && status >= 500)
        return "Server error. This is not a client issue — check server logs.";
      return "";
  }
};

/**
 * Format Zod validation issues into readable multi-line text.
 */
const formatZodIssues = (issues: ZodIssue[]): string => {
  return issues
    .map((issue) => {
      const location = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      let line = `  • ${location}: ${issue.message}`;
      if (issue.expected) line += ` (expected: ${issue.expected}`;
      if (issue.received) line += `, received: ${issue.received}`;
      if (issue.expected) line += ")";
      return line;
    })
    .join("\n");
};

/**
 * Convert any error into a semantic error report.
 *
 * @param err - The caught error
 * @param context - Call context for richer reporting
 */
export const toSemanticError = (
  err: unknown,
  context?: { path?: string; input?: unknown },
): SemanticError => {
  // oRPC structured error
  if (err instanceof ORPCError) {
    const zodIssues = extractZodIssues(err.data);

    const code: string = typeof err.code === "string" ? err.code : "UNKNOWN";
    return {
      code,
      status: err.status,
      message: err.message || `Server returned ${code} (HTTP ${err.status})`,
      path: context?.path,
      details: zodIssues ?? err.data ?? undefined,
      hint: generateHint(code, err.status, context),
    };
  }

  // Network / fetch errors
  if (
    err instanceof TypeError &&
    /fetch|network|ECONNREFUSED/i.test(err.message)
  ) {
    return {
      code: "NETWORK_ERROR",
      message: err.message,
      path: context?.path,
      hint: "Cannot reach the API server. Verify --api-url (or $CAT_API_URL) and ensure the server is running.",
    };
  }

  // Generic Error
  if (err instanceof Error) {
    return {
      code: "CLIENT_ERROR",
      message: err.message,
      path: context?.path,
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: String(err),
    path: context?.path,
  };
};

/**
 *     设计为同时对人类和 AI agent 可读。
 * Format a semantic error into stderr-friendly multi-line text.
 *     Designed to be readable by both humans and AI agents.
 */
export const formatSemanticError = (se: SemanticError): string => {
  const lines: string[] = [];

  lines.push(
    `[ERROR] ${se.code}${se.status ? ` (HTTP ${se.status})` : ""}: ${se.message}`,
  );

  if (se.path) {
    lines.push(`  path: ${se.path}`);
  }

  // Format Zod validation issues specially
  if (Array.isArray(se.details)) {
    // oxlint-disable-next-line no-unsafe-type-assertion
    const zodIssues = se.details as ZodIssue[];
    if (zodIssues.length > 0 && zodIssues[0] && "message" in zodIssues[0]) {
      lines.push("  validation errors:");
      lines.push(formatZodIssues(zodIssues));
    } else {
      lines.push(`  details: ${JSON.stringify(se.details)}`);
    }
  } else if (se.details !== undefined) {
    lines.push(`  details: ${JSON.stringify(se.details)}`);
  }

  if (se.hint) {
    lines.push(`  hint: ${se.hint}`);
  }

  return lines.join("\n");
};

/**
 * Wrap an async operation: catch errors, print semantic report, and exit.
 */
export const withErrorReporting = async (
  fn: () => Promise<void>,
  context?: { path?: string; input?: unknown },
): Promise<void> => {
  try {
    await fn();
  } catch (err) {
    const se = toSemanticError(err, context);
    // oxlint-disable-next-line no-console
    console.error(formatSemanticError(se));
    process.exit(1);
  }
};
