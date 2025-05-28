import { expect, test } from "vitest";
import { getCookieFunc } from "./cookie";

test("getCookieFunc test", () => {
  const getCookie = getCookieFunc(
    "sessionId=d6d127b91dcdb4d63d82dc1224fb6bfff71b3a33727740dd3dadf8592dd3e0b3",
  );
  const sessionId = getCookie("sessionId");
  expect(sessionId).toBe(
    "d6d127b91dcdb4d63d82dc1224fb6bfff71b3a33727740dd3dadf8592dd3e0b3",
  );
});
