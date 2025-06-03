<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import { onMounted, ref, watch } from "vue";
import InputLabel from "./InputLabel.vue";
import { useToastStore } from "../stores/toast";
import Picker from "./picker/Picker.vue";
import { PickerOption } from "./picker";
import { z } from "zod/v4";

const props = defineProps<{
  settingKey: string;
  label: string;
  zodEnum: string[];
  options: PickerOption[];
}>();

const { info, trpcWarn, zWarn } = useToastStore();

const value = ref("");
const valueSchema = z.enum(props.zodEnum);

const handleSet = async () => {
  valueSchema
    .parseAsync(value.value)
    .then(async (pValue) => {
      await trpc.setting.set
        .mutate({
          key: props.settingKey,
          value: pValue,
        })
        .then(() => {
          info(`成功更新设置 ${props.label} 到 ${pValue}`);
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

watch(value, (to) => to && handleSet());

onMounted(async () => {
  await update();
});
</script>

<template>
  <InputLabel>{{ label }}</InputLabel>
  <Picker v-model="value" :options />
</template>
