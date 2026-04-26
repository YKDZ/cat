<script setup lang="ts">
import type { NonNullJSONType } from "@cat/shared";

import {
  NumberField,
  NumberFieldContent,
  NumberFieldDecrement,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@cat/ui";
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

const value = computed(() => Number(props.data ?? schema.default));

const onUpdate = (newValue: number) => {
  emits("_update", newValue);
};
</script>

<template>
  <FormField :name="schema.title ?? String(propertyKey)">
    <FormItem>
      <FormLabel>{{ schema.title ?? propertyKey }}</FormLabel>
      <FormControl>
        <NumberField :model-value="value" @update:model-value="onUpdate">
          <NumberFieldContent>
            <NumberFieldDecrement />
            <NumberFieldInput />
            <NumberFieldIncrement />
          </NumberFieldContent>
        </NumberField>
      </FormControl>
      <FormDescription v-if="schema.description">
        {{ schema.description }}
      </FormDescription>
      <FormMessage />
    </FormItem>
  </FormField>
</template>
