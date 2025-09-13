<script setup lang="ts">
import { computed, inject } from "vue";
import { schemaKey } from "..";
import Toggler from "../../Toggler.vue";
import RendererLabel from "../utils/RendererLabel.vue";
import type { JSONType } from "@cat/shared/schema/json";

const props = defineProps<{
  propertyKey?: string;
  data: JSONType;
}>();

const emits = defineEmits<{
  (e: "_update", to: JSONType): void;
}>();

const schema = inject(schemaKey)!;

const value = computed(() => Boolean(props.data ?? schema.default));

const handleUpdate = (event: Event) => {
  const input = event.target as HTMLInputElement;
  emits("_update", input.value);
};
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <RendererLabel :schema :property-key />
    <Toggler v-model="value" @change="handleUpdate" />
  </div>
</template>
