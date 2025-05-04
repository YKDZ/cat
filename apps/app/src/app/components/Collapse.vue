<script setup lang="ts">
import { vOnClickOutside } from "@vueuse/components";

const props = defineProps({
  text: {
    type: String,
    default: "点击展开",
  },
  textClasses: {
    type: String,
    default: "",
  },
});

const isOpen = defineModel<boolean>("isOpen", { default: false });

const handleClickOutside = () => {
  isOpen.value = false;
};
</script>

<template>
  <div v-on-click-outside="handleClickOutside">
    <div class="relative">
      <div
        class="mb-1 px-2 py-1 flex gap-1 w-fit cursor-pointer items-center hover:bg-highlight-darker"
        @click="isOpen = !isOpen"
      >
        <span class="select-none text-nowrap" :class="textClasses">{{
          text
        }}</span>
        <span
          class="i-mdi:chevron-down inline-block transform-gpu transition-all"
          :class="{ 'transform-rotate-180': isOpen }"
        ></span>
      </div>

      <Transition name="slide-down">
        <div
          v-if="isOpen"
          class="px-3 py-2 bg-highlight h-fit w-fit shadow-md left-0 right-0 absolute z-50"
          style="top: calc(100% + 0.25rem)"
        >
          <slot />
        </div>
      </Transition>
    </div>
  </div>
</template>

<style lang="css" scoped>
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
  transform-origin: top;
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
