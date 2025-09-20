<script setup lang="ts">
import { computed, useAttrs } from "vue";
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

const attrs = useAttrs();

const state = computed(() => ({
  disabled: props.disabled,
}));

const inputProps = computed(() => {
  const result: InputProps = {
    icon: props.icon,
    disabled: state.value.disabled,
    "aria-disabled": state.value.disabled,
  };

  return { result, ...attrs };
});
</script>

<template>
  <div :class="classes?.['input-container']">
    <slot v-if="icon" name="icon" :props="inputProps" :state :classes>
      <span :class="[icon, classes?.['input-icon']]" />
    </slot>
    <slot :props="inputProps" :state :classes v-bind="$attrs"
      ><input :class="classes?.input" v-bind="{ ...$attrs, ...props }"
    /></slot>
  </div>
  <slot name="custom" :props="inputProps" :state :classes v-bind="$attrs" />
</template>
