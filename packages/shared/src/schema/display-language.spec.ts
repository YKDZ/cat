import { describe, expect, it } from "vitest";

import {
  DefaultDisplayLanguage,
  DisplayLanguageSchema,
  DisplayLanguageValues,
} from "./display-language.ts";

describe("DisplayLanguageSchema", () => {
  it("defines the complete supported display-language set", () => {
    expect(DisplayLanguageValues).toEqual(["zh_cn", "en_us"]);
    expect(DefaultDisplayLanguage).toBe("zh_cn");
    expect(DisplayLanguageSchema.safeParse("../../secret").success).toBe(false);
  });
});
