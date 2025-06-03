<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useToastStore } from "../stores/toast";

const { toasts } = storeToRefs(useToastStore());
</script>

<template>
  <TransitionGroup
    name="list"
    tag="div"
    class="bg-transparent flex flex-col gap-2 items-end top-3 fixed z-100 md:bottom-5 md:right-5 md:top-auto"
  >
    <div
      v-for="toast in toasts"
      :key="toast.id"
      :class="{
        'text-highlight-content bg-highlight': toast.type === 'INFO',
        'text-black bg-yellow-300': toast.type === 'WARNNING',
        'text-black bg-red-300': toast.type === 'ERROR',
      }"
      class="p-4 text-right w-fit shadow-lg relative md:min-w-32"
    >
      {{ toast.message }}
    </div>
  </TransitionGroup>
</template>

<style lang="css" scoped>
.list-enter-active,
.list-leave-active {
  --at-apply: "transition-transform";
}

.list-enter-from {
  --at-apply: "-translate-y-20 lg:translate-y-20";
}

.list-leave-to {
  --at-apply: "translate-x-100";
}
</style>
