import type { Data } from "./+data";
import { useProjectStore } from "@/app/stores/project";
import { injectPiniaData } from "@/app/utils/pinia";

export const onData = injectPiniaData<Data>((pinia, { projects }) => {
  useProjectStore(pinia).addProjects(...projects);
});
