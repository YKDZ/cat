<script setup lang="ts">
import type {
  _JSONSchema,
  JSONSchema,
  NonNullJSONType,
} from "@cat/shared/schema/json";
import { trpc } from "@cat/app-api/trpc/client";
import SettingForm from "./SettingForm.vue";

const props = defineProps<{
  schema: _JSONSchema;
}>();

const configSetter = async (
  value: NonNullJSONType,
  schema: JSONSchema,
  key?: string | number,
) => {
  if (!key || typeof key === "number") return;

  if (
    Object.keys(value as object).length === 0 ||
    !Object.keys(value as object).includes(key)
  )
    return;

  const toValue = (value as Record<string, NonNullJSONType>)[key];

  if (!toValue) return;

  await trpc.setting.set.mutate([{ key, value: toValue }]);
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
      const value = await trpc.setting.get.query({ key });
      data[key] = value;
    }),
  );

  return data as NonNullJSONType;
};
</script>

<template>
  <SettingForm :schema :config-setter :config-getter />
</template>
