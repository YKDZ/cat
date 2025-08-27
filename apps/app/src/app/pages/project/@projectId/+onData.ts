import type { Data } from "./+data";
import { useProjectStore } from "@/app/stores/project";
import { injectPiniaData } from "@/app/utils/pinia";
import { PageContextServer } from "vike/types";

export const onData: (ctx: PageContextServer & { data?: Data }) => void =
  injectPiniaData<Data>((pinia, { project }) => {
    useProjectStore(pinia).addProjects(project);
  });
