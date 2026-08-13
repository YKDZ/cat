import {
  DefaultDisplayLanguage,
  type DisplayLanguage,
  DisplayLanguageSchema,
  parsePreferredLanguage,
} from "@cat/shared";

const parseSupportedLanguage = (value: unknown): DisplayLanguage | null => {
  const parsed = DisplayLanguageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const mapPreferredLanguage = (
  acceptLanguage: string | undefined,
): DisplayLanguage | null => {
  const preferred = parsePreferredLanguage(acceptLanguage ?? "")
    ?.split("-")[0]
    ?.toLocaleLowerCase();
  if (preferred === "zh") return "zh_cn";
  if (preferred === "en") return "en_us";
  return null;
};

export const resolveDisplayLanguage = async (input: {
  cookie: string | null;
  acceptLanguage: string | undefined;
  readDeploymentDefault: () => Promise<unknown>;
}): Promise<DisplayLanguage> => {
  const cookie = parseSupportedLanguage(input.cookie);
  if (cookie !== null) return cookie;

  const preferred = mapPreferredLanguage(input.acceptLanguage);
  if (preferred !== null) return preferred;

  return (
    parseSupportedLanguage(await input.readDeploymentDefault()) ??
    DefaultDisplayLanguage
  );
};
