import { expect, test } from "vitest";
import { toShortFixed } from "./string";

test("should return shortened number", () => {
  expect(toShortFixed(1)).toStrictEqual("1");
  expect(toShortFixed(1.25)).toStrictEqual("1.3");
  expect(toShortFixed(1.201)).toStrictEqual("1.2");
  expect(toShortFixed(1.2)).toStrictEqual("1.2");
  expect(toShortFixed(0.5)).toStrictEqual("0.5");
  expect(toShortFixed(0.565, 2)).toStrictEqual("0.56");
});
