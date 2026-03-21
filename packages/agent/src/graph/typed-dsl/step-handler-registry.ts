import type { TypedNodeContext } from "./types";

export type StepHandler<TIn = unknown, TOut = unknown> = (
  input: TIn,
  ctx: TypedNodeContext,
) => Promise<TOut>;

const handlers = new Map<string, StepHandler>();

export const registerStepHandler = (
  name: string,
  handler: StepHandler,
): void => {
  if (handlers.has(name)) {
    throw new Error(`Step handler already registered: ${name}`);
  }
  handlers.set(name, handler);
};

export const getStepHandler = (name: string): StepHandler | undefined =>
  handlers.get(name);

export const hasStepHandler = (name: string): boolean => handlers.has(name);
