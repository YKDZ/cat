<script setup lang="ts">
import { computed, inject } from "vue";
import type { NonNullJSONType } from "@cat/shared/schema/json";
import { schemaKey } from "../utils.ts";

const props = defineProps<{
  propertyKey: string | number;
  data: NonNullJSONType;
}>();

const emits = defineEmits<{
  (e: "_update", to: NonNullJSONType): void;
}>();

const schema = inject(schemaKey)!;

const value = computed(() => {
  try {
    return Number(props.data ?? schema.default);
  } catch {
    return 0;
  }
});

const handleUpdate = (event: Event) => {
  const inputEl = event.target as HTMLInputElement;
  emits("_update", inputEl.value);
};
</script>

<template>
  <label class="flex flex-col gap-0.5"
    ><span class="text-foreground font-semibold">{{
      schema.title ?? propertyKey
    }}</span>
    <span class="text-sm text-foreground">{{ schema.description }}</span>
    <input
      :value
      type="number"
      class="text-foreground px-3 outline-0 bg-transparent h-10 w-full select-none ring-1 ring-background ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-primary"
      @input="handleUpdate"
    />
  </label>
</template>
