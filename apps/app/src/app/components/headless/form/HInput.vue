<script setup lang="ts">
import { computed } from "vue";
import type { JSX } from "vue/jsx-runtime";

type Classes = {
  "input-container"?: string;
  "input-icon"?: string;
  input?: string;
};

type InputProps = Pick<
  JSX.IntrinsicElements["input"],
  "disabled" | "aria-disabled"
> & {
  icon?: string;
};

const props = defineProps<{
  icon?: string;
  classes?: Classes;
  disabled?: boolean;
}>();

const modelValue = defineModel();

const state = computed(() => ({
  disabled: props.disabled,
}));

const inputProps = computed(() => {
  const result: InputProps = {
    icon: props.icon,
    disabled: state.value.disabled,
    "aria-disabled": state.value.disabled,
  };

  return result;
});
</script>

<template>
  <div :class="classes?.['input-container']">
    <slot v-if="icon" name="icon" v-bind="inputProps" :state :classes>
      <span :class="[icon, classes?.['input-icon']]" />
    </slot>
    <slot :state :classes v-bind="{ ...inputProps, ...$attrs }"
      ><input
        v-model="modelValue"
        :class="classes?.input"
        v-bind="{ ...inputProps, ...$attrs }"
    /></slot>
  </div>
  <slot name="custom" v-bind="{ ...inputProps, ...$attrs }" :state :classes />
</template>
