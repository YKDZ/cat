export type setCookie = (key: string, value: string, maxAge?: number) => void;
export type delCookie = (key: string) => void;
export type getCookie = (name: string) => string | null;
export type getQueryParam = (name: string) => string | undefined;
export type getReqHeader = (name: string) => string | undefined;
export type setResHeader = (name: string, value: string) => void;

export const createHTTPHelpers = (
  req: Request,
  resHeaders: Headers,
): {
  setCookie: setCookie;
  delCookie: delCookie;
  getCookie: getCookie;
  getQueryParam: getQueryParam;
  getReqHeader: getReqHeader;
  setResHeader: setResHeader;
} => {
  const getCookie = getCookieFunc(req.headers.get("Cookie") || "");
  const getQueryParam = getQueryParamFunc(req.url);

  return {
    setCookie: (
      key: string,
      value: string,
      maxAge: number = 7 * 24 * 60 * 60,
    ) => {
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

export const getCookieFunc = (cookies: string): getCookie => {
  const getCookie = (name: string): string | null => {
    if (!cookies) return null;

    const match = cookies.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? match[1] : null;
  };
  return getCookie;
};

export const getQueryParamFunc = (url: string): getQueryParam => {
  const urlParams = new URL(url).searchParams;

  return (name: string) => {
    return urlParams.get(name) || undefined;
  };
};

export type HTTPHelpers = ReturnType<typeof createHTTPHelpers>;
