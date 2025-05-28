import { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { CreateWSSContextFnOptions } from "@trpc/server/adapters/ws";
import { getCookieFunc } from "../utils/cookie";
import { userFromSessionId } from "../utils/user";

export const createHttpContext = async ({
  req,
  resHeaders,
}: Pick<FetchCreateContextFnOptions, "req" | "resHeaders">) => {
  const getCookie = getCookieFunc(req.headers.get("Cookie") || "");
  const getQueryParam = getQueryParamFunc(req.url);

  const sessionId = getCookie("sessionId") ?? null;
  const user = await userFromSessionId(sessionId);

  return {
    user,
    sessionId,
    setCookie: (key: string, value: string | undefined, maxAge: number) => {
      resHeaders.append(
        "Set-Cookie",
        `${key}=${value}; Path=/; HttpOnly; Max-Age=${maxAge}`,
      );
    },
    delCookie: (key: string) => {
      resHeaders.append("Set-Cookie", `${key}=; Path=/; HttpOnly; Max-Age=0`);
    },
    getCookie,
    getQueryParam,
    getReqHeader: (name: string) => {
      return req.headers.get(name) || undefined;
    },
    setResHeader: (name: string, value: string) => {
      resHeaders.set(name, value);
    },
  };
};

const getQueryParamFunc = (url: string) => {
  const urlParams = new URL(url).searchParams;

  return (name: string) => {
    return urlParams.get(name) || undefined;
  };
};

export const createWSContext = async ({
  req,
}: Pick<CreateWSSContextFnOptions, "req">) => {
  const getCookie = getCookieFunc(req.headers.cookie || "");

  return {
    getCookie,
  };
};

export type WSContext = Awaited<ReturnType<typeof createWSContext>>;
export type HttpContext = Awaited<ReturnType<typeof createHttpContext>>;

export const EMPTY_CONTEXT = {
  user: null,
  sessionId: "",
  setCookie: () => {},
  getCookie: () => "",
  getQueryParam: () => "",
  setResHeader: () => {},
  delCookie: () => {},
  getReqHeader: () => "",
};
