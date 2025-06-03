<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import { onMounted, ref } from "vue";
import Input from "./Input.vue";
import InputLabel from "./InputLabel.vue";
import { useToastStore } from "../stores/toast";
import z from "zod/v4";

const props = defineProps<{
  settingKey: string;
  label: string;
  icon: string;
}>();

const { info, trpcWarn, zWarn } = useToastStore();

const value = ref("");
const valueSchema = z.url({ error: "设置必须是合法的 URL" });

const handleSet = async () => {
  await valueSchema
    .parseAsync(value.value)
    .then(async (pValue) => {
      await trpc.setting.set
        .mutate({
          key: props.settingKey,
          value: pValue,
        })
        .then(() => {
          info(`成功更新设置 ${props.label} 到 ${value.value}`);
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
  value.value = (await trpc.setting.get.query({
    key: props.settingKey,
  })) as string;
};

onMounted(async () => {
  await update();
});
</script>

<template>
  <InputLabel>{{ label }}</InputLabel>
  <Input v-model="value" type="url" :icon @change="handleSet" />
</template>
