import {
  delCookie,
  setCookie,
  getCookie,
  getQueryParam,
  getReqHeader,
  setResHeader,
  getCookieFunc,
} from "@cat/shared/utils";
import type { IncomingMessage, ServerResponse } from "node:http";

export const createHTTPHelpers = (
  req: IncomingMessage,
  res: ServerResponse,
): {
  setCookie: setCookie;
  delCookie: delCookie;
  getCookie: getCookie;
  getQueryParam: getQueryParam;
  getReqHeader: getReqHeader;
  setResHeader: setResHeader;
} => {
  const getCookie = getCookieFunc(req.headers.cookie || "");

  const searchParams = new URLSearchParams(req.url?.split("?")[1] || "");
  const getQueryParam = (name: string) => searchParams.get(name) || undefined;

  return {
    setCookie: (
      key: string,
      value: string | undefined,
      maxAge: number | undefined = 7 * 24 * 60 * 60,
    ) => {
      const cookie = `${key}=${value}; Path=/; HttpOnly; Max-Age=${maxAge}`;
      const existingCookies = res.getHeader("Set-Cookie");

      if (existingCookies) {
        const cookies = Array.isArray(existingCookies)
          ? existingCookies
          : [existingCookies.toString()];
        res.setHeader("Set-Cookie", [...cookies, cookie]);
      } else {
        res.setHeader("Set-Cookie", cookie);
      }
    },
    delCookie: (key: string) => {
      const cookie = `${key}=; Path=/; HttpOnly; Max-Age=0`;
      const existingCookies = res.getHeader("Set-Cookie");

      if (existingCookies) {
        const cookies = Array.isArray(existingCookies)
          ? existingCookies
          : [existingCookies.toString()];
        res.setHeader("Set-Cookie", [...cookies, cookie]);
      } else {
        res.setHeader("Set-Cookie", cookie);
      }
    },
    getCookie,
    getQueryParam,
    getReqHeader: (name: string) => {
      const value = req.headers[name.toLowerCase()];
      return Array.isArray(value) ? value[0] : value;
    },
    setResHeader: (name: string, value: string) => {
      res.setHeader(name, value);
    },
  };
};
