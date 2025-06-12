<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";
import { schemaKey } from "..";
import Toggler from "../../Toggler.vue";

const props = defineProps<{
  propertyKey?: string;
  data: boolean;
}>();

const emits = defineEmits<{
  (e: "_update", to: boolean): void;
}>();

const schema = inject(schemaKey)!;
const skipNextUpdate = ref(false);

const value = ref(props.data ?? schema.default);

watch(value, (newVal) => {
  if (skipNextUpdate.value) {
    skipNextUpdate.value = false;
    return;
  }
  emits("_update", newVal);
});

watch(
  () => props.data,
  (newData) => {
    skipNextUpdate.value = true;
    value.value = newData;
  },
);
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <label class="text-highlight-content">{{
      schema.title ?? propertyKey
    }}</label>
    <Toggler v-model="value" />
  </div>
</template>
