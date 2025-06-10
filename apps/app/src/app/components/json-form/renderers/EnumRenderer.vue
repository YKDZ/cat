<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";
import { schemaKey, transferDataToString } from "..";
import Picker from "../../picker/Picker.vue";
import type { PickerOption } from "../../picker";

const props = defineProps<{
  propertyKey?: string;
  data: unknown;
}>();

const emits = defineEmits<{
  (e: "_update", to: unknown): void;
}>();

const schema = inject(schemaKey);

const jsonSchema = computed(() => {
  return JSON.parse(schema ?? "{}");
});
const value = ref(props.data ?? jsonSchema.value.defaults);

const enumValues = computed(() => {
  return jsonSchema.value.enum as unknown[];
});

const options = computed(() => {
  return enumValues.value.map((value) => {
    return {
      value,
      content: transferDataToString(value),
    } satisfies PickerOption;
  });
});

watch(value, (to) => emits("_update", to));
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <label class="text-highlight-content">{{
      jsonSchema.title ?? propertyKey
    }}</label>
    <Picker v-model="value" :options />
  </div>
</template>
