import { describe, it, expect } from "vitest";

import { placeholderize } from "../memory-template";
import { tokenizeOp } from "../tokenize";

describe("spaCy tokenizer version number recognition", () => {
  const versionStrings = ["1.20", "1.21", "1.20.4", "1.21.1"];

  for (const v of versionStrings) {
    it(`tokenizes "${v}"`, async () => {
      const { tokens } = await tokenizeOp({ text: `Update ${v}` });
      const result = placeholderize(tokens, `Update ${v}`);
      // Log observed behavior for offline analysis
      console.log(`"Update ${v}" → template: "${result.template}"`);
      console.log(
        `  slots:`,
        result.slots.map(
          (s) => `${s.placeholder}=${s.originalValue}(${s.tokenType})`,
        ),
      );
      // At minimum, the output must be defined
      expect(result.template).toBeDefined();
    });
  }
});
