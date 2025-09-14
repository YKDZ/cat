<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useToastStore } from "../stores/toast";
import { watch } from "vue";
import { usePageContext } from "vike-vue/usePageContext";

const ctx = usePageContext();

const { toasts } = storeToRefs(useToastStore());
const { error } = useToastStore();

watch(
  () => ctx.abortReason,
  (to) => error(to as string),
);
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
        'text-warning-content bg-warning': toast.type === 'WARNING',
        'text-error-content bg-error': toast.type === 'ERROR',
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
