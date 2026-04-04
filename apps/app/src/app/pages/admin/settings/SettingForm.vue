<script setup lang="ts">
import type { _JSONSchema, NonNullJSONType } from "@cat/shared/schema/json";

import SettingForm from "@/app/components/SettingForm.vue";
import { orpc } from "@/app/rpc/orpc";

const props = defineProps<{
  schema: _JSONSchema;
}>();

const configSetter = async (value: NonNullJSONType) => {
  if (
    props.schema.type !== "object" ||
    typeof props.schema.properties !== "object"
  )
    return;

  const obj = value as Record<string, NonNullJSONType>;

  await Promise.all(
    Object.keys(props.schema.properties).map(async (key) => {
      if (!(key in obj)) return;
      await orpc.setting.set({ key, value: obj[key] });
    }),
  );
};

const configGetter = async () => {
  if (
    props.schema.type !== "object" ||
    typeof props.schema.properties !== "object"
  )
    throw new Error("schema type must be object");

  const data: Record<string, NonNullJSONType> = {};

  await Promise.all(
    Object.keys(props.schema.properties).map(async (key) => {
      const value = await orpc.setting.get({ key });
      data[key] = value;
    }),
  );

  return data as NonNullJSONType;
};
</script>

<template>
  <SettingForm :schema :config-setter :config-getter />
</template>
