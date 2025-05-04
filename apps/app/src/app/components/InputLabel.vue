<script setup lang="ts">
import { ref } from "vue";

const props = defineProps({
  required: Boolean,
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
    class="text-gray-800 font-500 cursor-pointer select-none -mb-0.5"
    :class="{
      'label after:text-red-500 after:ml-0.5': required,
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
