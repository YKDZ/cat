import { describe, expect, it } from "vitest";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";

describe("exactOptionalProps", () => {
  it("omits undefined keys while preserving false, zero, empty, and null values", () => {
    const result = exactOptionalProps({
      omitted: undefined,
      enabled: false,
      count: 0,
      label: "",
      nullable: null,
    });

    expect(result).toEqual({
      enabled: false,
      count: 0,
      label: "",
      nullable: null,
    });
    expect(Object.hasOwn(result, "omitted")).toBe(false);
  });

  it("does not mutate the forwarded props object", () => {
    const props = { value: "kept", optional: undefined };
    exactOptionalProps(props);
    expect(Object.hasOwn(props, "optional")).toBe(true);
  });
});
