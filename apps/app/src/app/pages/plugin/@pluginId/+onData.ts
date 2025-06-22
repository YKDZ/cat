import { usePluginStore } from "@/app/stores/plugin";
import type { Data } from "./+data";
import { injectPiniaData } from "@/app/utils/pinia";
import type { Plugin } from "@cat/shared";

export const onData = injectPiniaData<Data>((pinia, { plugin }) => {
  if (!plugin) return;
  usePluginStore(pinia).addPlugins(plugin as Plugin);
});
