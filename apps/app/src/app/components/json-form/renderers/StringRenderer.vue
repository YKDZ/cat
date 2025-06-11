<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";
import { schemaKey, transferDataToString } from "..";

const props = defineProps<{
  propertyKey?: string;
  data: unknown;
}>();

const emits = defineEmits<{
  (e: "_update", to: string): void;
}>();

const schema = inject(schemaKey);

const jsonSchema = computed(() => {
  return JSON.parse(schema ?? "{}");
});

const value = ref(
  transferDataToString(props.data) ??
    transferDataToString(jsonSchema.value.default),
);

const inputType = computed(() => {
  if (jsonSchema.value.format === "email") return "email";
  else return "text";
});

const handleUpdate = () => {
  emits("_update", value.value);
};
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <label class="text-highlight-content">{{
      jsonSchema.title ?? propertyKey
    }}</label>
    <input
      v-model="value"
      :type="inputType"
      class="text-highlight-content-darker px-3 outline-0 bg-transparent h-10 w-full select-none ring-1 ring-highlight-darkest ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-base"
      @change="handleUpdate"
    />
  </div>
</template>
