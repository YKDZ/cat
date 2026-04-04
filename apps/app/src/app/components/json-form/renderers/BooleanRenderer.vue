<script setup lang="ts">
import type { NonNullJSONType } from "@cat/shared/schema/json";

import { Switch } from "@cat/ui";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@cat/ui";
import { computed, inject } from "vue";

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
  <FormField :name="schema.title ?? String(propertyKey)">
    <FormItem>
      <FormLabel>{{ schema.title ?? propertyKey }}</FormLabel>
      <FormControl>
        <Switch :checked="value" @update:checked="handleUpdate" />
      </FormControl>
      <FormDescription v-if="schema.description">
        {{ schema.description }}
      </FormDescription>
      <FormMessage />
    </FormItem>
  </FormField>
</template>
