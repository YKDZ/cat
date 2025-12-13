<script setup lang="ts">
import { computed, inject } from "vue";
import type { _JSONSchema, NonNullJSONType } from "@cat/shared/schema/json";
import { schemaKey } from "../utils.ts";
import { Switch } from "@/app/components/ui/switch";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";

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
        <Switch :value="String(value)" @update:model-value="handleUpdate" />
      </FormControl>
      <FormDescription> {{ schema.description }} </FormDescription>
      <FormMessage />
    </FormItem>
  </FormField>
</template>
