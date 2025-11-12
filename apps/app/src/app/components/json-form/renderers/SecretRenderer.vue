<script setup lang="ts">
import { computed, inject, ref } from "vue";
import * as z from "zod/v4";
import type { NonNullJSONType } from "@cat/shared/schema/json";
import { schemaKey, transferDataToString } from "../utils.ts";

const props = defineProps<{
  propertyKey: string | number;
  data: NonNullJSONType;
}>();

const emits = defineEmits<{
  (e: "_update", to: NonNullJSONType): void;
}>();

const schema = inject(schemaKey)!;

const value = computed(() =>
  transferDataToString(props.data ?? schema.default),
);

const visible = ref(false);

const type = computed(() => {
  if (visible.value === true) return "text";
  else return "password";
});

const autocomplete = computed(() => {
  try {
    return z.string().parse(schema["x-autocomplete"]);
  } catch {
    return "off";
  }
});

const handleUpdate = (event: Event) => {
  const input = event.target as HTMLInputElement;
  emits("_update", input.value);
};
</script>

<template>
  <label class="flex flex-col gap-0.5">
    <span class="text-foreground font-semibold">{{
      schema.title ?? propertyKey
    }}</span>
    <span class="text-sm text-foreground">{{ schema.description }}</span>
    <div class="flex items-center justify-between relative">
      <input
        :value
        :autocomplete
        :type
        class="text-foreground px-3 outline-0 bg-transparent h-10 w-full select-none ring-1 ring-background ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-primary"
        @input="handleUpdate"
      />
      <span
        class="p-1 rounded-md inline-flex cursor-pointer items-center right-1 justify-center absolute hover:bg-background"
        @click="visible = !visible"
      >
        <div
          :class="!visible ? 'icon-[mdi--eye]' : 'icon-[mdi--eye-off]'"
          class="size-4"
      /></span>
    </div>
  </label>
</template>
