<script setup lang="ts">
import { computed, inject } from "vue";
import type { JSONType } from "@cat/shared/schema/json";
import { schemaKey, transferDataToString } from "..";
import RendererLabel from "../utils/RendererLabel.vue";

defineProps<{
  propertyKey?: string;
  data: JSONType;
}>();

defineEmits<{
  (e: '_update', to: JSONType): void;
}>();

const schema = inject(schemaKey)!;

const constValue = computed(() => {
  return schema.const;
});
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <RendererLabel :schema :property-key />
    <span>{{ transferDataToString(constValue) }}</span>
  </div>
</template>
