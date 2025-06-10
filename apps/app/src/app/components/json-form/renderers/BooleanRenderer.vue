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

const schema = inject(schemaKey);

const jsonSchema = computed(() => {
  return JSON.parse(schema ?? "{}");
});

const value = ref(props.data ?? jsonSchema.value.default);

watch(value, (to) => emits("_update", to));
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <label class="text-highlight-content">{{
      jsonSchema.title ?? propertyKey
    }}</label>
    <Toggler v-model="value" />
  </div>
</template>
