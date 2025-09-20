<script setup lang="ts">
import type { JSONSchema, JSONType } from "@cat/shared/schema/json";
import { trpc } from "@cat/app-api/trpc/client";
import SettingForm from "./SettingForm.vue";

const props = defineProps<{
  schema: JSONSchema;
}>();

const configSetter = async (
  value: JSONType,
  schema: JSONSchema,
  key?: string,
) => {
  if (!key) return;
  if (
    Object.keys(value as object).length === 0 ||
    !Object.keys(value as object).includes(key)
  )
    return;

  await trpc.setting.set.mutate([
    { key, value: (value as Record<string, JSONType>)[key] },
  ]);
};

const configGetter = async () => {
  if (props.schema.type !== "object")
    throw new Error("schema type must be object");

  const data: Record<string, JSONType> = {};
  for (const key in props.schema.properties) {
    const value = await trpc.setting.get.query({ key });
    data[key] = value;
  }

  return data as JSONType;
};
</script>

<template>
  <SettingForm :schema :config-setter :config-getter />
</template>
