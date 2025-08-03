<script setup lang="ts">
import type { JSONSchema } from "zod/v4/core";
import { trpc } from "@/server/trpc/client";
import type { JSONType } from "@cat/shared";
import SettingForm from "./SettingForm.vue";

const props = defineProps<{
  schema: JSONSchema.JSONSchema;
}>();

const configSetter = async (updated: Map<string, JSONType>) => {
  await trpc.setting.set.mutate(
    Array.from(updated)
      .map(([key, value]) => {
        if (!value) {
          return null;
        }
        return {
          key,
          value,
        };
      })
      .filter((item) => item !== null),
  );
};

const configGetter = async (key: string) => {
  return await trpc.setting.get.query({ key });
};
</script>

<template>
  <SettingForm :schema :config-setter :config-getter />
</template>
