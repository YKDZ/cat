import { useGlossaryStore } from "@/app/stores/glossary";
import type { Data } from "./+data";
import { injectPiniaData } from "@/app/utils/pinia";

export const onData = injectPiniaData<Data>((pinia, { glossaries }) => {
  useGlossaryStore(pinia).addGlossaries(...glossaries);
});
