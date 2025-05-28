<script setup lang="ts">
import { computed } from "vue";
import Loading from "./Loading.vue";
import MagicKeys from "./magickey/MagicKeys.vue";
import { storeToRefs } from "pinia";
import { useProfileStore } from "../stores/profile";

const props = defineProps({
  fullWidth: Boolean,
  isProcessing: Boolean,
  transparent: Boolean,
  noText: Boolean,
  large: Boolean,
  left: Boolean,
  disabled: Boolean,
  focused: Boolean,
  magicKey: {
    type: String,
    required: false,
    default: "",
  },
  icon: {
    type: String,
    required: false,
    default: null,
  },
});

const { showBtnMagicKey } = storeToRefs(useProfileStore());

const emits = defineEmits<{
  (e: "magic-click"): void;
}>();

const dynBtnClasses = computed(() => {
  if (!props.large)
    return {
      "w-full": props.fullWidth && !props.noText,
      "w-fit px-3.5 py-2.5 gap-1": !props.fullWidth && !props.noText,
      "w-10 h-10 gap-0 aspect-ratio-square": props.noText,
      "py-1.5": !props.noText,
      "text-highlight bg-base": !props.transparent && !props.disabled,
      "text-black bg-transparent":
        props.transparent && !props.disabled && !props.focused,
      "hover:bg-base-darker":
        !props.focused && !props.transparent && !props.disabled,
      "hover:bg-highlight-darkest":
        !props.focused && props.transparent && !props.disabled,
      "bg-highlight-darkest": props.focused && !props.disabled,
      "bg-highlight-darkest text-black cursor-not-allowed": props.disabled,
      "cursor-pointer": !props.disabled,
      "justify-center": !props.left || props.noText,
      "justify-start pl-2": props.left,
    };
  else
    return {
      "w-full": props.fullWidth && !props.noText,
      "w-fit px-4.5 py-3.5 gap-1": !props.fullWidth && !props.noText,
      "w-12 h-12 gap-0 aspect-ratio-square": props.noText,
      "text-highlight bg-base":
        !props.transparent && !props.disabled && !props.focused,
      "text-black bg-transparent":
        props.transparent && !props.disabled && !props.focused,
      "hover:bg-base-darker":
        !props.focused && !props.transparent && !props.disabled,
      "hover:bg-highlight-darkest":
        !props.focused && props.transparent && !props.disabled,
      "bg-highlight-darkest": props.focused && !props.disabled,
      "bg-highlight-darkest text-black cursor-not-allowed": props.disabled,
      "cursor-pointer": !props.disabled,
      "gap-2 py-2": !props.noText,
      "justify-center": !props.left || props.noText,
      "justify-start pl-3": props.left,
    };
});

const dynTextClasses = computed(() => {
  if (!props.large) return "text-sm";
  else return "";
});

const dynIconClasses = computed(() => {
  if (!props.large) return props.icon + " w-5 h-5";
  else return props.icon + " w-6 h-6";
});
</script>

<template>
  <button
    class="rounded-md flex gap-1 select-none items-center"
    :class="dynBtnClasses"
  >
    <div v-if="icon && !isProcessing" :class="dynIconClasses" />
    <Loading v-else-if="isProcessing" size="1rem" />
    <span v-if="!noText" class="font-bold text-nowrap" :class="dynTextClasses">
      <slot />
    </span>
    <MagicKeys
      v-show="magicKey.trim().length > 0 && showBtnMagicKey"
      :key-string="magicKey"
      @press="emits('magic-click')"
    />
  </button>
</template>
