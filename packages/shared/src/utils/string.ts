export const toShortFixed = (
  num: number,
  fractionDigits: number = 1,
): string => {
  const fixed = num.toFixed(fractionDigits);
  return parseFloat(fixed).toString();
};

export const compareCodeUnitStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export const parsePreferredLanguage = (
  acceptLanguage: string,
): string | null => {
  if (!acceptLanguage) return null;

  return (
    acceptLanguage
      .split(",")
      .map((entry) => {
        const [lang, qValue] = entry.trim().split(";q=");
        return {
          lang,
          q: qValue !== undefined ? parseFloat(qValue) : 1.0,
        };
      })
      .sort((a, b) => b.q - a.q)[0]?.lang ?? null
  );
};
