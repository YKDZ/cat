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
});

const modalValue = defineModel({ type: String });
</script>

<template>
  <div
    class="flex gap-1 items-center relative"
    :class="{
      'max-w-2/3': !fullWidth,
      'w-full': fullWidth,
    }"
  >
    <div v-if="icon" :class="icon" class="text-lg left-2 absolute"></div>
    <input
      v-model="modalValue"
      :type
      :placeholder
      class="text-black px-3 outline-0 bg-transparent h-10 w-full select-none ring-1 ring-highlight-darkest ring-offset-transparent file:text-black file:font-bold file:font-medium file:mr-2 file:px-3 file:py-2 file:bg-neutral disabled:opacity-50 file:cursor-text disabled:cursor-not-allowed focus-visible:ring-base file:-ml-2.5"
      :class="{
        'pl-8': icon,
        'rounded-md': !noRound,
      }"
    />
  </div>
</template>
