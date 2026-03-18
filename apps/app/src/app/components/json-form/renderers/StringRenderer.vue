<script setup lang="ts">
import type { NonNullJSONType } from "@cat/shared/schema/json";

import { Input } from "@cat/ui";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@cat/ui";
import { computed, inject } from "vue";
import * as z from "zod/v4";

import { schemaKey, transferDataToString } from "../utils.ts";

const props = defineProps<{
  propertyKey: string | number;
  data: NonNullJSONType;
}>();


const emits = defineEmits<{
  (e: "_update", to: NonNullJSONType): void;
}>();


const schema = inject(schemaKey)!;


const value = computed(() => {
  return transferDataToString(props.data ?? schema.default);
});


const type = computed(() => {
  if (schema.format === "email") return "email";
  else return "text";
});


const autocomplete = computed(() => {
  try {
    return z.string().parse(schema["x-autocomplete"]);
  } catch {
    return "off";
  }
});


const handleUpdate = (value: string | number) => {
  emits("_update", value);
};
</script>

<template>
  <FormField :name="schema.title ?? String(propertyKey)">
    <FormItem>
      <FormLabel>{{ schema.title ?? propertyKey }}</FormLabel>
      <FormControl>
        <Input
          :model-value="value"
          :type
          :autocomplete
          @update:model-value="handleUpdate"
        />
      </FormControl>
      <FormDescription v-if="schema.description">
        {{ schema.description }}
      </FormDescription>
      <FormMessage />
    </FormItem>
  </FormField>
</template>
