export const createHTTPHelpers = (req: Request, resHeaders: Headers) => {
  const getCookie = getCookieFunc(req.headers.get("Cookie") || "");
  const getQueryParam = getQueryParamFunc(req.url);

  return {
    setCookie: (
      key: string,
      value: string | undefined,
      maxAge: number | undefined = 7 * 24 * 60 * 60,
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

export const getCookieFunc = (cookies: string) => {
  const getCookie = (name: string) => {
    if (!cookies) return undefined;

    const match = cookies.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? match[1] : undefined;
  };
  return getCookie;
};

export const getQueryParamFunc = (url: string) => {
  const urlParams = new URL(url).searchParams;

  return (name: string) => {
    return urlParams.get(name) || undefined;
  };
};

export type HTTPHelpers = ReturnType<typeof createHTTPHelpers>;
