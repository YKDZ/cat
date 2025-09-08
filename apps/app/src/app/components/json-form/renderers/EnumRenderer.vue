<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";
import { schemaKey, transferDataToString } from "..";
import Picker from "../../picker/Picker.vue";
import type { PickerOption } from "../../picker";
import type { JSONType } from "@cat/shared";
import RendererLabel from "../utils/RendererLabel.vue";

const props = defineProps<{
  propertyKey?: string;
  data: JSONType;
}>();

const emits = defineEmits<{
  (e: "_update", to: JSONType): void;
}>();

const schema = inject(schemaKey)!;
const skipNextUpdate = ref(false);

const value = ref(props.data ?? schema.defaults);

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

watch(
  () => props.data,
  (newData) => {
    skipNextUpdate.value = true;
    value.value = newData;
  },
);

watch(value, (newVal) => {
  if (skipNextUpdate.value) {
    skipNextUpdate.value = false;
    return;
  }
  emits("_update", newVal as JSONType);
});
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <RendererLabel :schema :property-key />
    <Picker v-model="value" :options />
  </div>
</template>
