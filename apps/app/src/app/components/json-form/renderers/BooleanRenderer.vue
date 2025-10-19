<script setup lang="ts">
import { computed, inject } from "vue";
import type { _JSONSchema, NonNullJSONType } from "@cat/shared/schema/json";
import HToggle from "@/app/components/headless/HToggle.vue";
import { schemaKey } from "../utils.ts";

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
    <HToggle
      :value
      :classes="{
        'base-checked': 'toggle toggle-md toggle-base',
        'base-unchecked': 'toggle toggle-md toggle-highlight-darker',
        'thumb-checked':
          'toggle-thumb toggle-thumb-md toggle-thumb-highlight toggle-thumb-checked',
        'thumb-unchecked':
          'toggle-thumb toggle-thumb-md toggle-thumb-highlight',
      }"
      @update="handleUpdate"
    />
  </label>
</template>
