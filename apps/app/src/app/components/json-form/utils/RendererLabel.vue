<script setup lang="ts">
import { JSONSchema } from "@cat/shared";

const props = defineProps<{
  propertyKey?: string;
  schema: JSONSchema;
}>();
</script>

<template>
  <div class="flex gap-0.5 flex-col text-highlight-content">
    <label>{{ schema.title ?? propertyKey }}</label>
    <label class="text-xs">{{ schema.description }}</label>
  </div>
</template>
