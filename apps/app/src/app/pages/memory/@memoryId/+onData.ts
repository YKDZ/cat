import type { Data } from "./+data";
import { useMemoryStore } from "@/app/stores/memory";
import { injectPiniaData } from "@/app/utils/pinia";
import { PageContextServer } from "vike/types";

export const onData: (ctx: PageContextServer & { data?: Data }) => void =
  injectPiniaData<Data>((pinia, { memory }) => {
    useMemoryStore(pinia).upsertMemories(memory);
  });
