import { expect, test } from "vitest";
import { safeJoinURL } from "./url.ts";

test("should return joined url", () => {
  const result = safeJoinURL("http://localhost:3000/", "/test\\sub/path");
  expect(result).toStrictEqual("http://localhost:3000/test/sub/path");
});
