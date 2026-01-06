import { parse, stringify } from "devalue";
import {
  isQueryCache,
  serializeQueryCache,
  useQueryCache,
  type _UseQueryEntryNodeValueSerialized,
} from "@pinia/colada";
import type { Pinia, StateTree } from "pinia";

export interface DehydratedState {
  vanilla: StateTree;
  colada: Record<string, _UseQueryEntryNodeValueSerialized>;
}

export const serializePiniaState = (pinia: Pinia): string => {
  const payload = {
    vanilla: stripPcProperties(pinia.state.value),
    colada: useQueryCache(pinia),
  };

  return stringify(payload, {
    PiniaColada_TreeMapNode: (data: unknown) =>
      isQueryCache(data) && serializeQueryCache(data),
  });
};

export const deserializePiniaState = (serialized: string): DehydratedState => {
  // oxlint-disable-next-line no-unsafe-return
  return parse(serialized, {
    PiniaColada_TreeMapNode: (data: unknown) => data,
  });
};

const stripPcProperties = <T>(target: T): T | undefined => {
  if (!target) {
    return;
  }

  const cleanEntries = Object.entries(target).filter(
    ([key]) => !key.startsWith("_pc"),
  );

  // oxlint-disable-next-line no-unsafe-type-assertion
  return Object.fromEntries(cleanEntries) as T;
};
