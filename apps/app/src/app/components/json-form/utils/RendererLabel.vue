<script setup lang="ts">
import type { JSONSchema } from "@cat/shared/schema/json";

defineProps<{
  propertyKey?: string;
  schema: JSONSchema;
}>();
</script>

<template>
  <label class="mt-2 flex flex-col gap-0.5">
    <span class="text-highlight-content-darker font-semibold">{{
      schema.title ?? propertyKey
    }}</span>
    <span class="text-sm text-highlight-content">{{ schema.description }}</span>
  </label>
</template>
