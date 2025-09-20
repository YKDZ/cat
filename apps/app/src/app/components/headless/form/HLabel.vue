<script setup lang="ts">
import { computed, provide } from "vue";
import { labelContextKey, type HLabelContext } from "./index.ts";

type Classes = {
  label?: string;
};

const props = defineProps<{
  classes?: Classes;
}>();

const context = computed<HLabelContext>(() => {
  return {} satisfies HLabelContext;
});

provide(labelContextKey, context.value);
</script>

<template>
  <label :class="[props.classes?.label]" v-bind="{ ...$attrs }">
    <slot />
  </label>
</template>
