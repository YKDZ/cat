import { useDocumentStore } from "@/app/stores/document";
import type { Data } from "./+data";
import { injectPiniaData } from "@/app/utils/pinia";
import { PageContextServer } from "vike/types";

export const onData: (ctx: PageContextServer & { data?: Data }) => void =
  injectPiniaData<Data>((pinia, { document }) => {
    useDocumentStore(pinia).upsertDocuments(document);
  });
