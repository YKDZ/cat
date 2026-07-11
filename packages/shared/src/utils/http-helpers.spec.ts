import { describe, expect, it } from "vitest";

import {
  createHTTPHelpers,
  shouldUseSecureCookies,
} from "#/utils/http-helpers.ts";

describe("createHTTPHelpers", () => {
  it("marks cookies secure for HTTPS requests", () => {
    const headers = new Headers();
    const helpers = createHTTPHelpers(
      new Request("http://internal/session"),
      headers,
      true,
    );

    helpers.setCookie("sessionId", "session-value");
    helpers.delCookie("csrfToken");

    expect(headers.getSetCookie()).toEqual([
      "sessionId=session-value; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax; Secure",
      "csrfToken=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure",
    ]);
  });

  it("does not mark cookies secure for HTTP requests", () => {
    const headers = new Headers();
    const helpers = createHTTPHelpers(
      new Request("https://cat.example.test/session"),
      headers,
      false,
    );

    helpers.setCookie("sessionId", "session-value");

    expect(headers.getSetCookie()).toEqual([
      "sessionId=session-value; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax",
    ]);
  });

  it.each([
    ["production HTTP", true, "http://internal/session", undefined, true],
    [
      "direct HTTPS",
      false,
      "https://cat.example.test/session",
      undefined,
      true,
    ],
    ["TLS-terminating proxy", false, "http://internal/session", "https", true],
    ["development HTTP", false, "http://localhost/session", undefined, false],
  ])(
    "resolves cookie security for %s",
    (_name, isProduction, requestUrl, forwardedProto, expected) => {
      expect(
        shouldUseSecureCookies({
          isProduction,
          requestUrl,
          forwardedProto,
        }),
      ).toBe(expected);
    },
  );
});
