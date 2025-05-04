<script setup lang="ts">
import { ref } from "vue";
import { vOnClickOutside } from "@vueuse/components";

const open = defineModel<boolean>("open", { default: false });

const triggerEl = ref<HTMLElement>();

const placement = ref<"top" | "bottom">("bottom");

const calculatePosition = () => {
  if (!triggerEl.value) return;

  const triggerRect = triggerEl.value.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const spaceBelow = viewportHeight - triggerRect.bottom;
  const spaceAbove = triggerRect.top;

  // 假设菜单高度大约为 200px，可以根据实际内容调整
  placement.value =
    spaceBelow < 200 && spaceAbove > spaceBelow ? "top" : "bottom";
};

const handleTrigger = () => {
  if (!open.value) calculatePosition();
  open.value = !open.value;
};

const handleClose = () => {
  if (open.value) open.value = false;
};
</script>

<template>
  <div v-on-click-outside="handleClose" class="w-full">
    <div class="relative">
      <div ref="triggerEl" @click="handleTrigger">
        <slot name="trigger" />
      </div>
      <Transition>
        <div
          v-if="open"
          class="rounded-xs bg-highlight min-w-48 w-fit shadow-md absolute z-50"
          :class="{
            'mt-1 top-full': placement === 'bottom',
            'mb-1 bottom-full': placement === 'top',
          }"
        >
          <slot name="content" />
        </div>
      </Transition>
    </div>
  </div>
</template>
