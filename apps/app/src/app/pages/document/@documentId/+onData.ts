import { useDocumentStore } from "@/app/stores/document";
import type { Data } from "./+data";
import { injectPiniaData } from "@/app/utils/pinia";

export const onData = injectPiniaData<Data>((pinia, { document }) => {
  useDocumentStore(pinia).upsertDocuments(document);
});
