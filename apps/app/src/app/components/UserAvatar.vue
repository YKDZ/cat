<script setup lang="ts">
import { User } from "@cat/shared";
import { computed } from "vue";

const props = defineProps<{
  user: User;
  size: string;
  link?: boolean;
  withName?: boolean;
  button?: boolean;
  fullWidth?: boolean;
}>();

const dynStyle = computed(() => ({
  width: props.size,
  height: props.size,
}));
</script>

<template>
  <div
    class="flex gap-2.5 select-none items-center"
    :class="{
      'cursor-pointer hover:bg-gray-200 px-2 py-1 rounded-sm': button,
      'w-full': fullWidth,
    }"
  >
    <div
      class="text-center rounded-full bg-base flex items-center justify-center"
      :style="dynStyle"
    >
      <span class="text-highlight font-bold">{{ user.name.charAt(0) }}</span>
    </div>
    <span v-if="withName" class="">{{ user.name }}</span>
  </div>
</template>
