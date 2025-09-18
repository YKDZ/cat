<script setup lang="ts">
import { computed, inject } from "vue";
import type { JSONType } from "@cat/shared/schema/json";
import * as z from "zod/v4";
import { schemaKey, transferDataToString } from "..";
import type { PickerOption } from "@/app/components/picker/index.ts";
import RendererLabel from "@/app/components/json-form/utils/RendererLabel.vue";
import Picker from "@/app/components/picker/Picker.vue";

const props = defineProps<{
  propertyKey?: string;
  data: JSONType;
}>();

const emits = defineEmits<{
  (e: "_update", to: JSONType): void;
}>();

const schema = inject(schemaKey)!;

const value = computed(() => props.data ?? schema.defaults);

const enumValues = computed(() => {
  return schema.enum as unknown[];
});

const options = computed(() => {
  return enumValues.value.map((value) => {
    return {
      value,
      content: transferDataToString(value),
    } satisfies PickerOption;
  });
});

const handleChange = (_: unknown, to: unknown) => {
  emits("_update", z.json().parse(to));
};
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <RendererLabel :schema :property-key />
    <Picker v-model="value" :options @change="handleChange" />
  </div>
</template>
