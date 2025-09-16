<script setup lang="ts">
import { computed } from "vue";
import type { Component } from "vue";
import type { JSX } from "vue/jsx-runtime";

type Classes = {
  base?: string;
  "base-checked"?: string;
  "base-unchecked"?: string;
  "base-disabled"?: string;
  "base-loading"?: string;
  thumb?: string;
  "thumb-checked"?: string;
  "thumb-unchecked"?: string;
  "thumb-disabled"?: string;
  label?: string;
};

type ToggleProps = Pick<
  JSX.IntrinsicElements["button"],
  | "disabled"
  | "type"
  | "onClick"
  | "aria-checked"
  | "aria-disabled"
  | "aria-busy"
  | "role"
  | "tabindex"
> & {
  role: "switch";
};

const props = withDefaults(
  defineProps<{
    as?: string | Component;
    disabled?: boolean;
    loading?: boolean;
    classes?: Classes;
  }>(),
  {
    as: "button",
    disabled: false,
    loading: false,
    classes: () => ({}),
  },
);

const checked = defineModel<boolean>({});

const emit = defineEmits<{
  update: [value: boolean];
  click: [event: Event];
}>();

const state = computed(() => ({
  checked: checked.value,
  disabled: props.disabled,
  loading: props.loading,
}));

const toggleProps = computed<ToggleProps>(() => {
  const isStringTag = typeof props.as === "string";
  const isButtonTag = isStringTag && props.as === "button";
  const result: ToggleProps = {
    role: "switch",
  };

  if (isButtonTag) result.type = "button";

  result["aria-checked"] = state.value.checked;

  if (state.value.disabled || state.value.loading) {
    result["aria-disabled"] = "true";
    result.tabindex = -1;
  } else {
    result.tabindex = 0;
  }

  if (state.value.loading) {
    result["aria-busy"] = "true";
  }

  result.onClick = (e: Event) => {
    if (state.value.disabled || state.value.loading) {
      e.preventDefault();
      return;
    }
    const newValue = !checked.value;
    checked.value = newValue;
    emit("update", newValue);
    emit("click", e);
  };

  return result;
});

const classes = computed(() => ({
  base: props.classes?.base ?? "",
  "base-checked": props.classes["base-checked"],
  "base-unchecked": props.classes["base-unchecked"],
  "base-disabled": props.classes["base-disabled"],
  "base-loading": props.classes["base-loading"],
  thumb: props.classes?.thumb ?? "",
  "thumb-checked": props.classes["thumb-checked"],
  "thumb-unchecked": props.classes["thumb-unchecked"],
  "thumb-disabled": props.classes["thumb-disabled"],
  label: props.classes?.label ?? "",
}));

const baseClass = computed(() => {
  if (state.value.loading)
    return classes.value["base-loading"] ?? classes.value.base;
  else if (state.value.disabled)
    return classes.value["base-disabled"] ?? classes.value.base;
  else if (state.value.checked)
    return classes.value["base-checked"] ?? classes.value.base;
  else return classes.value["base-unchecked"] ?? classes.value.base;
});

const thumbClass = computed(() => {
  if (state.value.disabled)
    return classes.value["thumb-disabled"] ?? classes.value.thumb;
  else if (state.value.checked)
    return classes.value["thumb-checked"] ?? classes.value.thumb;
  else return classes.value["thumb-unchecked"] ?? classes.value.thumb;
});

defineExpose({ classes, state });
</script>

<template>
  <component :is="as" v-bind="toggleProps" :class="[$attrs.class, baseClass]">
    <span id="thumb" :class="thumbClass" aria-hidden="true" />
    <span id="label" :class="classes.label">
      <slot />
    </span>
  </component>
  <slot name="custom" :props="toggleProps" :classes="classes" :state="state" />
</template>
