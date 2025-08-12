<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";
import { schemaKey, transferDataToString } from "..";
import type { JSONType } from "@cat/shared";
import Icon from "../../Icon.vue";
import type { JSONSchema } from "zod/v4/core";

const props = defineProps<{
  propertyKey?: string;
  data: JSONType;
}>();

const emits = defineEmits<{
  (e: "_update", to: string): void;
}>();

const schema = inject<
  JSONSchema.JSONSchema & {
    "x-autocomplete"?: string;
  }
>(schemaKey)!;

const value = ref(
  transferDataToString(props.data) ?? transferDataToString(schema.default),
);

const visible = ref(false);

const inputType = computed(() => {
  if (visible.value === true) return "text";
  else return "password";
});

const handleUpdate = () => {
  emits("_update", value.value);
};

watch(
  () => props.data,
  (newData) => {
    value.value = transferDataToString(newData);
  },
  { deep: true },
);
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <label class="text-highlight-content">{{
      schema.title ?? propertyKey
    }}</label>
    <div class="flex items-center justify-between relative">
      <input
        v-model="value"
        :autocomplete="schema['x-autocomplete']"
        :type="inputType"
        class="text-highlight-content-darker px-3 outline-0 bg-transparent h-10 w-full select-none ring-1 ring-highlight-darkest ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-base"
        @input="handleUpdate"
      />
      <span
        class="p-1 rounded-md inline-flex cursor-pointer items-center right-1 justify-center absolute hover:bg-highlight-darker"
        @click="visible = !visible"
      >
        <Icon :icon="!visible ? 'i-mdi:eye' : 'i-mdi:eye-off'"
      /></span>
    </div>
  </div>
</template>
