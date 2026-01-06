import { JSONObjectSchema, type JSONObject } from "@cat/shared/schema/json";
import z from "zod";
import type { IPluginService } from "./service";
import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";

const TokenTypeValues = [
  "text",
  "number",
  "variable",
  "whitespace",
  "term",
  "link",
  "mask",
  "space",
  "newline",
  "unknown",
] as const;

export type TokenType = (typeof TokenTypeValues)[number];

export enum TokenizerPriority {
  HIGHEST = 1000,
  STRUCTURE = 800,
  TERM = 600,
  VARIABLE = 400,
  LITERAL = 200,
  LOWEST = 0,
}

export const TokenSchema: z.ZodType<Token> = z.object({
  type: z.enum(TokenTypeValues),
  value: z.string(),
  start: z.int().nonnegative(),
  end: z.int().nonnegative(),

  children: z.lazy(() => TokenSchema.array().optional()),

  meta: JSONObjectSchema.optional(),
  ruleId: z.int().optional(),
});

export interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
  children?: Token[];
  meta?: JSONObject;
  ruleId?: number;
}

export interface ParserContext {
  source: string;
  cursor: number;
}

export type ParseResult = {
  token: Token;
};

export abstract class Tokenizer implements IPluginService {
  abstract getId(): string;

  getType(): PluginServiceType {
    return "TOKENIZER";
  }

  abstract getPriority(): TokenizerPriority;

  abstract parse: (
    ctx: ParserContext,
  ) => Promise<ParseResult | undefined> | ParseResult | undefined;
}
