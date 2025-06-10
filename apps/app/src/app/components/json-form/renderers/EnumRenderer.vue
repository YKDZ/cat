<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";
import { schemaKey } from "..";
import Picker from "../../picker/Picker.vue";
import type { PickerOption } from "../../picker";

const props = defineProps<{
  propertyKey?: string;
  data: any;
}>();

const emits = defineEmits<{
  (e: "_update", to: any): void;
}>();

const schema = inject(schemaKey);

const jsonSchema = computed(() => {
  return JSON.parse(schema ?? "");
});
const value = ref(props.data ?? jsonSchema.value.defaults);

const enumValues = computed(() => {
  return jsonSchema.value.enum as any[];
});

const options = computed(() => {
  return enumValues.value.map(
    (value) =>
      ({
        value,
        content: value,
      }) satisfies PickerOption,
  );
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
