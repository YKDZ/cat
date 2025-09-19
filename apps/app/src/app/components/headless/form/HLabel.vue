<script setup lang="ts">
import { inject, computed } from "vue";
import { FORM_CONTROL_SYMBOL, type FormControlContext } from "./index.ts";

type Classes = {
  label?: string;
};

const props = defineProps<{
  srOnly?: boolean;
  classes?: Classes;
}>();

const fc = inject<FormControlContext | undefined>(FORM_CONTROL_SYMBOL);

const labelId = computed(() => fc?.labelId ?? undefined);
const forId = computed(() => (fc ? fc.inputId.value : undefined));
const required = computed(() => (fc ? fc.required.value : false));
</script>

<template>
  <label
    v-if="fc"
    :id="labelId"
    :for="forId"
    :class="[props.srOnly ? 'sr-only' : '', props.classes?.label]"
  >
    <slot />
    <span v-if="required" aria-hidden="true">&nbsp;*</span>
  </label>

  <label v-else :class="props.classes?.label">
    <slot />
  </label>
</template>
