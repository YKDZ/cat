<script setup lang="ts">
import { computed, inject } from "vue";
import { schemaKey, transferDataToString } from "..";
import type { JSONType } from "@cat/shared";

const props = defineProps<{
  propertyKey?: string;
  data: JSONType;
}>();

const schema = inject(schemaKey)!;

const constValue = computed(() => {
  return schema.const;
});
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <label class="text-highlight-content">{{
      schema.title ?? propertyKey
    }}</label>
    <span>{{ transferDataToString(constValue) }}</span>
  </div>
</template>
