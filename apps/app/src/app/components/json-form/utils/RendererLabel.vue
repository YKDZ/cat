<script setup lang="ts">
import type { JSONSchema } from "@cat/shared/schema/json";

const props = defineProps<{
  propertyKey?: string;
  schema: JSONSchema;
}>();
</script>

<template>
  <div class="text-highlight-content flex flex-col gap-0.5">
    <label>{{ schema.title ?? propertyKey }}</label>
    <label class="text-xs">{{ schema.description }}</label>
  </div>
</template>
