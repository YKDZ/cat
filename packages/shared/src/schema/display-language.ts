import * as z from "zod";

export const DisplayLanguageValues = ["zh_cn", "en_us"] as const;
export const DisplayLanguageSchema = z.enum(DisplayLanguageValues);
export type DisplayLanguage = z.infer<typeof DisplayLanguageSchema>;

export const DefaultDisplayLanguage = "zh_cn" satisfies DisplayLanguage;
