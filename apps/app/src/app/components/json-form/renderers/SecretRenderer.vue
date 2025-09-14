<script setup lang="ts">
import { computed, inject, ref } from "vue";
import z from "zod";
import type { JSONType } from "@cat/shared/schema/json";
import { schemaKey, transferDataToString } from "..";
import RendererLabel from "@/app/utils/RendererLabel.vue";
import Icon from "@/app/components/Icon.vue";

const props = defineProps<{
  propertyKey?: string;
  data: JSONType;
}>();

const emits = defineEmits<{
  (e: "_update", to: JSONType): void;
}>();

const schema = inject(schemaKey)!;

const value = computed(() =>
  transferDataToString(props.data ?? schema.default),
);

const visible = ref(false);

const inputType = computed(() => {
  if (visible.value === true) return "text";
  else return "password";
});

const handleUpdate = (event: Event) => {
  const input = event.target as HTMLInputElement;
  emits("_update", input.value);
};
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <RendererLabel :schema :property-key />
    <div class="flex items-center justify-between relative">
      <input
        :value
        :autocomplete="z.string().optional().parse(schema['x-autocomplete'])"
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
