<script setup lang="ts">
const props = defineProps({
  type: {
    type: String,
    default: "text",
  },
  placeholder: {
    type: String,
    default: undefined,
  },
  icon: {
    type: String,
    default: undefined,
  },
  fullWidth: {
    type: Boolean,
    default: false,
  },
  noRound: {
    type: Boolean,
    default: false,
  },
  small: {
    type: Boolean,
    default: false,
  },
});

const modalValue = defineModel({ type: String });
</script>

<template>
  <div
    class="flex gap-1 items-center relative"
    :class="{
      'md:max-w-2/3': !fullWidth,
      'w-full': fullWidth,
    }"
  >
    <div
      v-if="icon"
      class="absolute"
      :class="[
        icon,
        {
          'text-lg left-2': !small,
          'left-1': small,
        },
      ]"
    />
    <input
      v-model="modalValue"
      :type
      :placeholder
      class="text-highlight-content-darker outline-0 bg-transparent w-full select-none ring-highlight-darkest ring-offset-transparent disabled:cursor-not-allowed focus-visible:ring-base"
      :class="{
        'px-3 h-10 ring-1': !small,
        'px-2 h-8 ring-0.5': small,
        'pl-8': icon && !small,
        'pl-6': icon && small,
        'rounded-md': !noRound,
      }"
    />
  </div>
</template>
