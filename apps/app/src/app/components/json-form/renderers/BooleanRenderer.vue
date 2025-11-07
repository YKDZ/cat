<script setup lang="ts">
import { computed, inject } from "vue";
import type { _JSONSchema, NonNullJSONType } from "@cat/shared/schema/json";
import { schemaKey } from "../utils.ts";
import { Switch } from "@/app/components/ui/switch";

const props = defineProps<{
  propertyKey: string | number;
  data: NonNullJSONType;
}>();

const emits = defineEmits<{
  (e: "_update", to: NonNullJSONType): void;
}>();

const schema = inject(schemaKey)!;

const value = computed(() => {
  try {
    return Boolean(props.data ?? schema.default);
  } catch {
    return false;
  }
});

const handleUpdate = (value: boolean) => {
  emits("_update", value);
};
</script>

<template>
  <label class="flex flex-col gap-0.5"
    ><span class="text-highlight-content-darker font-semibold">{{
      schema.title ?? propertyKey
    }}</span>
    <span class="text-sm text-highlight-content">{{ schema.description }}</span>
    <Switch :value="String(value)" @update="handleUpdate" />
  </label>
</template>
