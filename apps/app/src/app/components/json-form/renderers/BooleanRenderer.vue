<script setup lang="ts">
import { inject, ref, watch } from "vue";
import { schemaKey } from "..";
import Toggler from "../../Toggler.vue";
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
const skipNextUpdate = ref(false);

const value = ref<boolean>(Boolean(props.data ?? schema.default));

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
    value.value = Boolean(newData);
  },
);
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <RendererLabel :schema :property-key />
    <Toggler v-model="value" />
  </div>
</template>
