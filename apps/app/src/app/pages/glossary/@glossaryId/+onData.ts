import type { Data } from "./+data";
import { useGlossaryStore } from "@/app/stores/glossary";
import { injectPiniaData } from "@/app/utils/pinia";
import type { PageContextServer } from "vike/types";

export const onData: (ctx: PageContextServer & { data?: Data }) => void =
  injectPiniaData<Data>((pinia, { glossary }) => {
    useGlossaryStore(pinia).upsertGlossaries(glossary);
  });
