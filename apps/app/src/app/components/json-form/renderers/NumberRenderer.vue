<script setup lang="ts">
import { inject, ref, watch } from "vue";
import { schemaKey } from "..";
import RendererLabel from "../utils/RendererLabel.vue";

const props = defineProps<{
  propertyKey?: string;
  data: number;
}>();

const emits = defineEmits<{
  (e: "_update", to: number): void;
}>();

const value = ref(props.data);
const schema = inject(schemaKey)!;

const handleUpdate = () => {
  emits("_update", value.value);
};

watch(
  () => props.data,
  (newData) => {
    value.value = newData;
  },
);
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <RendererLabel :schema :property-key />
    <input
      v-model.number="value"
      type="number"
      class="text-highlight-content-darker px-3 outline-0 bg-transparent h-10 w-full select-none ring-1 ring-highlight-darkest ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-base"
      @input="handleUpdate"
    />
  </div>
</template>
