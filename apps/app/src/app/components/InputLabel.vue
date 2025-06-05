<script setup lang="ts">
import { ref } from "vue";

const props = defineProps({
  required: Boolean,
  noOffset: Boolean,
});

const labelRef = ref<HTMLLabelElement>();

const focusNextFocusable = () => {
  if (!labelRef.value) return;

  const focusableElements = Array.from(
    labelRef.value.parentElement?.querySelectorAll(`
      input:not([disabled]), 
      select:not([disabled]), 
      textarea:not([disabled]), 
      button:not([disabled]), 
      [tabindex]:not([disabled]):not([tabindex="-1"])
    `) || [],
  );

  const currentIndex = focusableElements.indexOf(labelRef.value);

  const target = focusableElements[currentIndex + 1] as HTMLElement;
  target?.focus();
};
</script>

<template>
  <label
    ref="labelRef"
    class="text-highlight-content font-500 w-fit cursor-pointer select-none"
    :class="{
      'label after:text-red-500 after:ml-0.5': required,
      '-mb-1.5': !noOffset,
    }"
    role="button"
    tabindex="0"
    @click="focusNextFocusable"
  >
    <slot />
  </label>
</template>

<style lang="css" scoped>
.label::after {
  content: "*";
}
</style>
