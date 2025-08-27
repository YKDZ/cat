import { useGlossaryStore } from "@/app/stores/glossary";
import type { Data } from "./+data";
import { injectPiniaData } from "@/app/utils/pinia";
import { PageContextServer } from "vike/types";

export const onData: (ctx: PageContextServer & { data?: Data }) => void =
  injectPiniaData<Data>((pinia, { glossaries }) => {
    useGlossaryStore(pinia).upsertGlossaries(...glossaries);
  });
