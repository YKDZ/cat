import { usePluginStore } from "@/app/stores/plugin";
import type { Data } from "./+data";
import { injectPiniaData } from "@/app/utils/pinia";

export const onData = injectPiniaData<Data>((pinia, { plugin }) => {
  if (!plugin) return;
  usePluginStore(pinia).addPlugins(plugin);
});
