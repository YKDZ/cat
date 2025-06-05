<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import { onMounted, ref } from "vue";
import { useToastStore } from "../stores/toast";
import InputLabel from "./InputLabel.vue";
import Toggler from "./Toggler.vue";

const props = defineProps<{
  pluginId: string;
  configKey: string;
}>();

const { info, trpcWarn } = useToastStore();

const value = ref<boolean>(false);

const handleSet = async () => {
  if (import.meta.env.SSR) return;

  await trpc.plugin.updateConfig
    .mutate({
      pluginId: props.pluginId,
      key: props.configKey,
      value: value.value,
    })
    .then(() => {
      info(`成功更新设置 ${props.configKey} 到 ${value.value}`);
    })
    .catch(async (e) => {
      await update();
      trpcWarn(e);
    });
};

const update = async () => {
  value.value = (
    await trpc.plugin.queryConfig.query({
      pluginId: props.pluginId,
      key: props.configKey,
    })
  )?.value as boolean;
};

onMounted(async () => {
  await update();
});
</script>

<template>
  <div class="flex gap-2 items-center">
    <InputLabel no-offset>{{ configKey }}</InputLabel>
    <Toggler v-model="value" @change="handleSet" />
  </div>
</template>
