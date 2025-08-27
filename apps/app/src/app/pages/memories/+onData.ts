import type { Data } from "./+data";
import { injectPiniaData } from "@/app/utils/pinia";
import { useMemoryStore } from "@/app/stores/memory";
import { PageContextServer } from "vike/types";

export const onData: (ctx: PageContextServer & { data?: Data }) => void =
  injectPiniaData<Data>((pinia, { memories }) => {
    useMemoryStore(pinia).upsertMemories(...memories);
  });
