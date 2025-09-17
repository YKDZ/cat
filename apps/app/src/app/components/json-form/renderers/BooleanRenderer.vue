<script setup lang="ts">
import { computed, inject } from "vue";
import type { JSONType } from "@cat/shared/schema/json";
import { schemaKey } from "../index.ts";
import RendererLabel from "@/app/components/json-form/utils/RendererLabel.vue";
import HToggle from "@/app/components/headless/HToggle.vue";

const props = defineProps<{
  propertyKey?: string;
  data: JSONType;
}>();

const emits = defineEmits<{
  (e: "_update", to: JSONType): void;
}>();

const schema = inject(schemaKey)!;

const value = computed(() => Boolean(props.data ?? schema.default));

const handleUpdate = (value: boolean) => {
  emits("_update", value);
};
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <RendererLabel :schema :property-key />
    <HToggle
      v-model="value"
      :classes="{
        'base-checked': 'toggle toggle-md toggle-highlight-darker',
        'base-unchecked': 'toggle toggle-md toggle-base',
        'thumb-checked': 'toggle-thumb toggle-thumb-md toggle-thumb-highlight',
        'thumb-unchecked':
          'toggle-thumb toggle-thumb-md toggle-thumb-highlight toggle-thumb-checked',
      }"
      @update="handleUpdate"
    />
  </div>
</template>
