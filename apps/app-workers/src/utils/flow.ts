import type { FlowDefinition } from "@/core";

export function defineFlow<TInput>(
  config: FlowDefinition<TInput>,
): FlowDefinition<TInput> {
  return config;
}
