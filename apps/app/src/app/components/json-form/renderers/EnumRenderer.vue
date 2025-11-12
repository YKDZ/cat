<script setup lang="ts">
import { computed, inject } from "vue";
import type { NonNullJSONType } from "@cat/shared/schema/json";
import * as z from "zod/v4";
import { schemaKey, transferDataToString } from "../utils.ts";
import type { PickerOption } from "@/app/components/picker/index.ts";
import Picker from "@/app/components/picker/Picker.vue";

const props = defineProps<{
  propertyKey: string | number;
  data: NonNullJSONType;
}>();

const emits = defineEmits<{
  (e: "_update", to: NonNullJSONType): void;
}>();

const schema = inject(schemaKey)!;

const value = computed(() => props.data ?? schema.defaults);

const enumValues = computed(() => {
  return schema.enum as unknown[];
});

const options = computed(() => {
  return enumValues.value.map((value) => {
    return {
      value,
      content: transferDataToString(value),
    } satisfies PickerOption;
  });
});

const handleChange = (to: unknown) => {
  const value = z.json().parse(to);
  if (value === null) return;
  emits("_update", value);
};
</script>

<template>
  <label class="flex flex-col gap-0.5"
    ><span class="text-foreground font-semibold">{{
      schema.title ?? propertyKey
    }}</span>
    <span class="text-sm text-foreground">{{ schema.description }}</span>
    <Picker v-model="value" :options @update:model-value="handleChange" />
  </label>
</template>
