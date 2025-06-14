<script setup lang="ts">
import { ref, onMounted, nextTick } from "vue";
import { vOnClickOutside } from "@vueuse/components";

const open = defineModel<boolean>("open", { default: false });

const triggerEl = ref<HTMLElement>();
const placement = ref<"top" | "bottom">("bottom");
const minWidth = ref("auto");

let resizeObserver: ResizeObserver | null = null;

const updateMinWidth = () => {
  if (triggerEl.value) {
    const rect = triggerEl.value.getBoundingClientRect();
    minWidth.value = `${rect.width}px`;
  }
};

const calculatePosition = () => {
  if (!triggerEl.value) return;

  const rect = triggerEl.value.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const spaceBelow = viewportHeight - rect.bottom;
  const spaceAbove = rect.top;

  placement.value =
    spaceBelow < 200 && spaceAbove > spaceBelow ? "top" : "bottom";
  updateMinWidth();
};

const handleTrigger = async () => {
  if (!open.value) {
    await nextTick(); // DOM ready
    calculatePosition();
  }
  open.value = !open.value;
};

const handleClose = () => {
  if (open.value) open.value = false;
};

onMounted(() => {
  if (!triggerEl.value) return;

  updateMinWidth();

  resizeObserver = new ResizeObserver(() => {
    updateMinWidth();
  });
  resizeObserver.observe(triggerEl.value);
});
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
          class="rounded-xs bg-highlight w-fit shadow-md absolute z-50"
          :class="{
            'mt-1 top-full': placement === 'bottom',
            'mb-1 bottom-full': placement === 'top',
          }"
          :style="{ minWidth }"
        >
          <slot name="content" />
        </div>
      </Transition>
    </div>
  </div>
</template>
