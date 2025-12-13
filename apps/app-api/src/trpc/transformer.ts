import type { DataTransformer } from "@trpc/server";
import { parse, stringify } from "devalue";

export const transformer: DataTransformer = {
  // oxlint-disable-next-line no-explicit-any no-unsafe-return no-unsafe-argument
  deserialize: (object: any) => parse(object),
  // oxlint-disable-next-line no-explicit-any
  serialize: (object: any) => stringify(object),
};
