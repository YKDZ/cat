<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import { useToastStore } from "../stores/toast";
import { onMounted, shallowRef } from "vue";
import type { JSONType } from "@cat/shared";
import JSONForm from "./json-form/JSONForm.vue";
import type { JSONSchema } from "zod/v4/core";

const props = defineProps<{
  configKey: string;
  schema: JSONSchema.JSONSchema;
}>();

const { info, trpcWarn } = useToastStore();

const data = shallowRef<JSONType>(null);

const handleUpdate = async (to: JSONType) => {
  data.value = to;
  await trpc.setting.set
    .mutate({
      key: props.configKey,
      value: to as JSONType,
    })
    .then(() => {
      info(`成功更新设置 ${props.configKey} 到 ${to}`);
    })
    .catch(async (e) => {
      await update();
      trpcWarn(e);
    });
};

const update = async () => {
  data.value = await trpc.setting.get.query({
    key: props.configKey,
  });
};

onMounted(update);
</script>

<template>
  <JSONForm :data :schema @update="handleUpdate" />
</template>
