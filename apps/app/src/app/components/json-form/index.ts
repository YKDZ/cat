import type { DefineComponent, InjectionKey } from "vue";
import type { JSONSchema, JSONType } from "@cat/shared/schema/json";
import StringRenderer from "./renderers/StringRenderer.vue";
import NumberRenderer from "./renderers/NumberRenderer.vue";
import BooleanRenderer from "./renderers/BooleanRenderer.vue";
import EnumRenderer from "./renderers/EnumRenderer.vue";
import ConstRenderer from "./renderers/ConstRenderer.vue";
import ArrayRenderer from "./renderers/ArrayRenderer.vue";
import SecretRenderer from "./renderers/SecretRenderer.vue";

export const schemaKey = Symbol() as InjectionKey<JSONSchema>;

export interface RendererProps {
  propertyKey?: string;
  data: JSONType;
}

export type RendererEmits = {
  _update: (to: JSONType) => void;
};

export type RendererComponent = DefineComponent<
  RendererProps, // Props
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  {}, // RawBindings
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  {}, // Data
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  {}, // Computed
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  {}, // Methods
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  {}, // Mixins
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  {}, // Extends
  RendererEmits // Emits
>;

type MatcherBasicValue = string | number | boolean;
type MatcherPredicate = (value: unknown) => boolean;
type MatcherValue = MatcherBasicValue | MatcherPredicate;
type MatcherRule = Record<string, MatcherValue>;

type Specificity = {
  matchedKeyAmount: number;
  constMatchAmount: number;
  predicateMatchAmount: number;
};

class Matcher {
  constructor(
    public readonly name: string | undefined,
    private readonly rule: MatcherRule,
    public readonly renderer: RendererComponent,
  ) {}

  getSpecificity(schema: unknown): Specificity | null {
    if (!schema || typeof schema !== "object") return null;
    const schemaObj = schema as Record<string, unknown>;

    const ruleKeys = Object.keys(this.rule);
    if (!includesAll(Object.keys(schemaObj), ruleKeys)) return null;

    let matchedKeys = 0;
    let constMatches = 0;
    let predicateMatches = 0;

    for (const [key, ruleValue] of Object.entries(this.rule)) {
      const schemaValue = schemaObj[key];

      if (typeof ruleValue === "function") {
        try {
          const ok = ruleValue(schemaValue);
          if (!ok) return null;
          matchedKeys++;
          predicateMatches++;
        } catch {
          return null;
        }
      } else {
        if (schemaValue !== ruleValue) return null;
        matchedKeys++;
        constMatches++;
      }
    }

    return {
      matchedKeyAmount: matchedKeys,
      constMatchAmount: constMatches,
      predicateMatchAmount: predicateMatches,
    };
  }
}

function compareSpecificity(a: Specificity, b: Specificity): number {
  if (a.predicateMatchAmount !== b.predicateMatchAmount)
    return a.predicateMatchAmount - b.predicateMatchAmount;
  if (a.matchedKeyAmount !== b.matchedKeyAmount)
    return a.matchedKeyAmount - b.matchedKeyAmount;
  if (a.constMatchAmount !== b.constMatchAmount)
    return a.constMatchAmount - b.constMatchAmount;
  return 0;
}

export class MatcherRegistry {
  public static matchers: Matcher[] = [];

  public static register(m: Matcher) {
    this.matchers.push(m);
  }

  public static match(
    schema: JSONSchema,
    specificityComparer: (
      a: Specificity,
      b: Specificity,
    ) => number = compareSpecificity,
  ): Matcher | null {
    let bestMatchers: { matcher: Matcher; spec: Specificity }[] = [];

    for (const m of this.matchers) {
      const spec = m.getSpecificity(schema);
      if (!spec) continue;

      if (bestMatchers.length === 0) {
        bestMatchers.push({ matcher: m, spec });
        continue;
      }

      const cmp = specificityComparer(spec, bestMatchers[0]!.spec);
      if (cmp > 0) {
        bestMatchers = [{ matcher: m, spec }];
      } else if (cmp === 0) {
        bestMatchers.push({ matcher: m, spec });
      }
    }

    if (bestMatchers.length === 0) return null;
    if (bestMatchers.length === 1) return bestMatchers[0]!.matcher;

    throw new Error(
      `MatcherRegistry.match: ambiguous match — multiple equally-specific matchers: ${bestMatchers.map((b) => b.matcher.name)}`,
    );
  }
}

const matchers: Matcher[] = [
  new Matcher(
    "enum",
    { type: "string", enum: (value: unknown) => Array.isArray(value) },
    EnumRenderer,
  ),
  new Matcher("const", { const: true }, ConstRenderer),
  new Matcher(
    "string-secret",
    { type: "string", "x-secret": true },
    SecretRenderer,
  ),
  new Matcher("string", { type: "string" }, StringRenderer),
  new Matcher("number", { type: "number" }, NumberRenderer),
  new Matcher("boolean", { type: "boolean" }, BooleanRenderer),
  new Matcher("array", { type: "array" }, ArrayRenderer),
];

matchers.forEach((renderer) => MatcherRegistry.register(renderer));

export const transferDataToString = (data: unknown, pretty = false): string => {
  if (typeof data === "string") return data;
  if (data === undefined) return "";
  if (data === null) return "null";
  try {
    return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  } catch {
    return String(data);
  }
};

const includesAll = <T>(arr: T[], target: T[]): boolean => {
  const s = new Set(arr);
  return target.every((v) => s.has(v));
};
