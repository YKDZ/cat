import type { InjectionKey } from "vue";

export const labelContextKey = Symbol() as InjectionKey<HLabelContext>;

export type HLabelContext = {
  for?: string;
};
