export const safeJoinURL = (base: string, path: string) => {
  const baseUrl = new URL(base);
  baseUrl.pathname = `${baseUrl.pathname.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  return baseUrl.toString();
};
