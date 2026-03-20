import { createRequire } from "node:module";
import * as z from "zod";

export const AvailableLocalesSchema = z.object({
  availableLocales: z.object({
    modern: z.array(z.string()),
    full: z.array(z.string()),
  }),
});

const require = createRequire(import.meta.url);
const availableLocalesSource: unknown = require("cldr-core/availableLocales.json");

export const AvailableLocales = AvailableLocalesSchema.parse(
  availableLocalesSource,
);
