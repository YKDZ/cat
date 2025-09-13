<script setup lang="ts">
import { computed, inject } from "vue";
import { schemaKey, transferDataToString } from "..";
import z from "zod";
import RendererLabel from "../utils/RendererLabel.vue";
import type { JSONType } from "@cat/shared/schema/json";

const props = defineProps<{
  propertyKey?: string;
  data: JSONType;
}>();

const emits = defineEmits<{
  (e: '_update', to: JSONType): void;
}>();

const schema = inject(schemaKey)!;

const value = computed(() => {
  return transferDataToString(props.data ?? schema.default);
});

const inputType = computed(() => {
  if (schema.format === "email") return "email";
  else return "text";
});

const handleUpdate = (event: Event) => {
  const input = event.target as HTMLInputElement;
  emits("_update", input.value);
};
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <RendererLabel :schema :property-key />
    <input
      @change="handleUpdate"
      :value
      :type="inputType"
      :autocomplete="z.string().optional().parse(schema['x-autocomplete'])"
      class="text-highlight-content-darker px-3 outline-0 bg-transparent h-10 w-full select-none ring-1 ring-highlight-darkest ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-base"
      @input="handleUpdate"
    />
  </div>
</template>
