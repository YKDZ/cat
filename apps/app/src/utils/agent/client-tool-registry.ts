/**
 * Client-side tool handler type.
 * Receives the validated arguments from the backend and returns a result
 * or throws an error. Handlers may be sync or async — the executor
 * always `await`s the return value so both cases are handled.
 */
export type ClientToolHandler = (args: Record<string, unknown>) => unknown;

/**
 * Registry for client-side tool handlers.
 * Maps tool names to their frontend handler functions.
 */
const handlers = new Map<string, ClientToolHandler>();

export const registerClientTool = (
  name: string,
  handler: ClientToolHandler,
): void => {
  handlers.set(name, handler);
};

export const getClientToolHandler = (
  name: string,
): ClientToolHandler | undefined => handlers.get(name);

export const hasClientToolHandler = (name: string): boolean =>
  handlers.has(name);

/**
 * Execute a client tool by name. Returns `{ result }` on success or
 * `{ error }` on failure.
 */
export const executeClientTool = async (
  name: string,
  args: Record<string, unknown>,
): Promise<{ result?: unknown; error?: string }> => {
  const handler = handlers.get(name);
  if (!handler) {
    return { error: `No client handler registered for tool "${name}"` };
  }
  try {
    const result = await handler(args);
    return { result };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
    };
  }
};
