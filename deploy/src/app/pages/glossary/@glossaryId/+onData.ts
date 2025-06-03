import type { Data } from "./+data";
import { useGlossaryStore } from "@/app/stores/glossary";
import { injectPiniaData } from "@/app/utils/pinia";

export const onData = injectPiniaData<Data>((pinia, { glossary }) => {
  useGlossaryStore(pinia).addGlossaries(glossary);
});
