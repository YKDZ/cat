import type { Data } from "./+data";
import { injectPiniaData } from "@/app/utils/pinia";
import { useMemoryStore } from "@/app/stores/memory";

export const onData = injectPiniaData<Data>((pinia, { memories }) => {
  useMemoryStore(pinia).addMemories(...memories);
});
