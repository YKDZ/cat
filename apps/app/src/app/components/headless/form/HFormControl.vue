<script setup lang="ts">
import { provide, reactive, computed } from "vue";
import { FORM_CONTROL_SYMBOL, type FormControlContext } from "./index.ts";

let __fc_counter = 0;
function useUniqueId(prefix = "fc") {
  __fc_counter += 1;
  return `${prefix}-${__fc_counter}`;
}

type Classes = {
  container?: string;
};

const props = defineProps<{
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  classes?: Classes;
}>();

const id = useUniqueId("form");
const labelId = `${id}-label`;
const descriptionId = `${id}-desc`;
const errorId = `${id}-err`;

const state = reactive({
  inputId: `${id}-input`,
  disabled: !!props.disabled,
  required: !!props.required,
  invalid: !!props.invalid,
});

function registerInput(customId?: string) {
  if (customId) state.inputId = customId;
  return state.inputId;
}

const context: FormControlContext = {
  id,
  labelId,
  descriptionId,
  errorId,
  inputId: computed(() => state.inputId),
  disabled: computed(() => state.disabled),
  required: computed(() => state.required),
  invalid: computed(() => state.invalid),
  registerInput,
  classes: props.classes,
};

provide(FORM_CONTROL_SYMBOL, context);
</script>

<template>
  <div :class="props.classes?.container">
    <slot />
  </div>
</template>
