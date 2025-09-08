<script setup lang="ts">
import { computed } from "vue";
import type { Component } from "vue";
import { JSX } from "vue/jsx-runtime";

type Classes = {
  base?: string;
  "base-loading"?: string;
  "base-disabled"?: string;
  label?: string;
  icon?: string;
  loading?: string;
};

type ButtonProps = Pick<
  JSX.IntrinsicElements["button"],
  "disabled" | "type" | "onClick" | "aria-disabled" | "aria-busy"
> & {
  icon?: string;
};

const props = withDefaults(
  defineProps<{
    as?: string | Component;
    disabled?: boolean;
    loading?: boolean;
    classes?: Classes;
    icon?: string;
  }>(),
  {
    as: "button",
    disabled: false,
    loading: false,
    classes: () => ({}),
  },
);

const emit = defineEmits<{
  click: [event: Event];
}>();

const state = computed(() => ({
  loading: props.loading,
  disabled: props.disabled,
}));

const buttonProps = computed<ButtonProps>(() => {
  const isStringTag = typeof props.as === "string";
  const isButtonTag = isStringTag && props.as === "button";
  const result: ButtonProps = {};

  result.icon = props.icon;

  if (isButtonTag) result.type = "button";

  if (isButtonTag)
    result.disabled = state.value.disabled || state.value.loading;

  if (state.value.loading) {
    result["aria-busy"] = "true";
  }

  if (state.value.disabled) {
    result["aria-disabled"] = "true";
  }

  result.onClick = (e: Event) => {
    if (state.value.disabled || state.value.loading) {
      e.preventDefault();
      return;
    }
    emit("click", e);
  };

  return result;
});

const classes = computed(() => ({
  base: props.classes?.base ?? "",
  "base-loading": props.classes["base-loading"],
  "base-disabled": props.classes["base-disabled"],
  label: props.classes?.label ?? "",
  icon: props.classes?.icon ?? "",
  loading: props.classes?.loading ?? "",
}));

const baseClass = computed(() => {
  if (state.value.loading)
    return classes.value["base-loading"] ?? classes.value.base;
  else if (state.value.disabled)
    return classes.value["base-disabled"] ?? classes.value.base;
  return classes.value.base;
});

defineExpose({ classes, state });
</script>

<template>
  <component :is="as" v-bind="buttonProps" :class="[$attrs.class, baseClass]">
    <span v-if="state.loading" :class="classes.loading" aria-hidden="true">
      <slot name="loading" />
    </span>
    <div :class="[icon, classes.icon]" />
    <span :class="classes.label">
      <slot />
    </span>
  </component>
  <slot name="custom" :props="buttonProps" :classes="classes" :state="state" />
</template>
