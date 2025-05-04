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
      class="text-black px-3 bg-transparent h-10 w-full select-none file:(text-sm text-black font-bold font-medium mr-2 px-3 py-2 bg-neutral cursor-pointer -ml-2.5) focus-visible:(outline-0 ring-1 ring-gray-200 ring-offset-transparent ring-offset-1) disabled:(opacity-50 cursor-not-allowed)"
      :class="{
        'pl-7': icon,
        'rounded-md': !noRound,
      }"
    />
  </div>
</template>
