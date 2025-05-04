export const getCookieFunc = (cookies: string) => {
  const getCookie = (name: string) => {
    if (!cookies) return undefined;

    const match = cookies.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? match[1] : undefined;
  };
  return getCookie;
};
