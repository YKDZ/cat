import { usePluginStore } from "@/app/stores/plugin";
import type { Data } from "./+data";
import { injectPiniaData } from "@/app/utils/pinia";
import type { Plugin } from "@cat/shared/schema/prisma/plugin";
import type { PageContextServer } from "vike/types";

export const onData: (ctx: PageContextServer & { data?: Data }) => void =
  injectPiniaData<Data>((pinia, { plugin }) => {
    if (!plugin) return;
    usePluginStore(pinia).addPlugins(plugin as Plugin);
  });
