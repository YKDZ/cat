<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import { onMounted, ref } from "vue";
import Input from "./Input.vue";
import InputLabel from "./InputLabel.vue";
import { useToastStore } from "../stores/toast";
import z from "zod/v4";

const props = defineProps<{
  pluginId: string;
  configKey: string;
}>();

const { info, trpcWarn, zWarn } = useToastStore();

const value = ref("");
const valueSchema = z.string().min(1, { error: "设置不能为空" });

const handleSet = async () => {
  await valueSchema
    .parseAsync(value.value)
    .then(async (pValue) => {
      await trpc.plugin.updateConfig
        .mutate({
          pluginId: props.pluginId,
          key: props.configKey,
          value: pValue,
        })
        .then(() => {
          info(`成功更新设置 ${props.configKey} 到 ${value.value}`);
        })
        .catch(async (e) => {
          await update();
          trpcWarn(e);
        });
    })
    .catch(async (e) => {
      await update();
      zWarn(e);
    });
};

const update = async () => {
  value.value = (
    await trpc.plugin.queryConfig.query({
      pluginId: props.pluginId,
      key: props.configKey,
    })
  )?.value as string;
};

onMounted(async () => {
  await update();
});
</script>

<template>
  <InputLabel>{{ configKey }}</InputLabel>
  <Input v-model="value" type="text" @change="handleSet" />
</template>
