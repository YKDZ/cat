<script setup lang="ts">
import { computed, useAttrs, inject } from "vue";
import { FORM_CONTROL_SYMBOL, type FormControlContext } from "./index.ts";

type Classes = {
  "input-container"?: string;
  "input-icon"?: string;
  input?: string;
};

type InputProps = Partial<
  Pick<
    HTMLInputElement,
    | "id"
    | "disabled"
    | "ariaDisabled"
    | "ariaLabelledByElements"
    | "ariaDescribedByElements"
    | "ariaInvalid"
    | "placeholder"
    | "type"
    | "name"
    | "autocomplete"
    | "value"
  > & { icon?: string }
>;

const props = defineProps<{
  icon?: string;
  classes?: Classes;
  disabled?: boolean;
  id?: string;
}>();

const attrs = useAttrs();
const fc = inject<FormControlContext | undefined>(FORM_CONTROL_SYMBOL);

const state = computed(() => ({
  disabled: !!props.disabled,
}));

const inputProps = computed<InputProps>(() => {
  const base: InputProps = {
    icon: props.icon,
    disabled: state.value.disabled || undefined,
    ariaDisabled: state.value.disabled ? "true" : undefined,
  };

  const externalId = (attrs.id as string | undefined) ?? props.id ?? undefined;

  if (fc) {
    const usedId = fc.registerInput(externalId as string | undefined);
    base.id = usedId;

    base["ariaInvalid"] = fc.invalid.value ? "true" : undefined;

    base.disabled = base.disabled || fc.disabled.value || undefined;
  } else {
    if (externalId) base.id = externalId;
  }

  return base as InputProps;
});
</script>

<template>
  <div :class="props.classes?.['input-container']">
    <slot
      v-if="props.icon"
      name="icon"
      :props="inputProps"
      :state="state"
      :classes="props.classes"
    >
      <span :class="[props.icon, props.classes?.['input-icon']]" />
    </slot>

    <slot
      :props="inputProps"
      :state="state"
      :classes="props.classes"
      v-bind="$attrs"
    >
      <input
        :id="inputProps.id"
        :class="props.classes?.input"
        v-bind="{ ...$attrs, ...inputProps }"
      />
    </slot>
  </div>

  <slot
    name="custom"
    :inputProps="inputProps"
    :state="state"
    :classes="props.classes"
    v-bind="{ ...$attrs }"
  />
</template>
