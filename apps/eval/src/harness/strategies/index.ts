// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- concrete strategies require widening to the registry interface
import type { ScenarioStrategy } from "../types";

import { memoryRecallStrategy } from "./memory-recall";
import { termRecallStrategy } from "./term-recall";

const strategyRegistry = new Map<string, ScenarioStrategy>([
  ["term-recall", termRecallStrategy as unknown as ScenarioStrategy],
  ["memory-recall", memoryRecallStrategy as unknown as ScenarioStrategy],
]);

export const getStrategy = (type: string): ScenarioStrategy => {
  const strategy = strategyRegistry.get(type);
  if (!strategy)
    throw new Error(
      `Unknown scenario type: "${type}". Available: ${[...strategyRegistry.keys()].join(", ")}`,
    );
  return strategy;
};
