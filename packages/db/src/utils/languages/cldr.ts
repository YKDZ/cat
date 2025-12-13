import availableLocales from "cldr-core/availableLocales.json";
import * as z from "zod";

export const AvailableLocalesSchema = z.object({
  availableLocales: z.object({
    modern: z.array(z.string()),
    full: z.array(z.string()),
  }),
});

export const AvailableLocales = AvailableLocalesSchema.parse(availableLocales);
