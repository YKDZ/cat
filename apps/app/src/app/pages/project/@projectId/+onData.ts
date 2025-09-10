import type { Data } from "./+data.ts";
import { useProjectStore } from "@/app/stores/project.ts";
import { injectPiniaData } from "@/app/utils/pinia.ts";
import type { PageContextServer } from "vike/types";

export const onData: (ctx: PageContextServer & { data?: Data }) => void =
  injectPiniaData<Data>((pinia, { project }) => {
    useProjectStore(pinia).addProjects(project);
  });
