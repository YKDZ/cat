import type { GraphDefinition } from "@/graph/types";

import { validateGraphDSL } from "./validator";

export const compileGraphDSL = (input: unknown): GraphDefinition => {
  const validated = validateGraphDSL(input);
  if (!validated.success) {
    throw validated.error;
  }

  return validated.data;
};
