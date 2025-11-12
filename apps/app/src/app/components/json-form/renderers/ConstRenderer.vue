<script setup lang="ts">
import { computed, inject } from "vue";
import type { NonNullJSONType } from "@cat/shared/schema/json";
import { schemaKey, transferDataToString } from "../utils.ts";

defineProps<{
  propertyKey: string | number;
  data: NonNullJSONType;
}>();

defineEmits<{
  (e: "_update", to: NonNullJSONType): void;
}>();

const schema = inject(schemaKey)!;

const constValue = computed(() => {
  return schema.const;
});
</script>

<template>
  <label class="flex flex-col gap-0.5">
    <span class="text-foreground font-semibold">{{
      schema.title ?? propertyKey
    }}</span>
    <span class="text-sm text-foreground">{{ schema.description }}</span>
    <span>{{ transferDataToString(constValue) }}</span>
  </label>
</template>
