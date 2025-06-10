<script setup lang="ts">
import { computed, inject } from "vue";
import { schemaKey, transferDataToString } from "..";

const props = defineProps<{
  propertyKey?: string;
  data: unknown;
}>();

const schema = inject(schemaKey);

const jsonSchema = computed(() => {
  return JSON.parse(schema ?? "");
});

const constValue = computed(() => {
  return jsonSchema.value.const as unknown;
});
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <label class="text-highlight-content">{{
      jsonSchema.title ?? propertyKey
    }}</label>
    <span>{{ transferDataToString(constValue) }}</span>
  </div>
</template>
