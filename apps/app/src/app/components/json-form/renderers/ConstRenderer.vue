<script setup lang="ts">
import { computed, inject } from "vue";
import type { NonNullJSONType } from "@cat/shared/schema/json";
import { schemaKey, transferDataToString } from "../utils.ts";
import { FormDescription, FormField, FormItem, FormLabel } from "@cat/app-ui";

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
  <FormField :name="schema.title ?? String(propertyKey)">
    <FormItem>
      <FormLabel>{{ schema.title ?? propertyKey }}</FormLabel>
      <FormDescription v-if="schema.description">
        {{ schema.description }}
      </FormDescription>
      <span class="text-sm">{{ transferDataToString(constValue) }}</span>
    </FormItem>
  </FormField>
</template>
