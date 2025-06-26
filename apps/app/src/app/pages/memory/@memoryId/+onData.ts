import type { Data } from "./+data";
import { useMemoryStore } from "@/app/stores/memory";
import { injectPiniaData } from "@/app/utils/pinia";

export const onData = injectPiniaData<Data>((pinia, { memory }) => {
  useMemoryStore(pinia).upsertMemories(memory);
});
