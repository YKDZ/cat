<script setup lang="ts">
import { computed, ref } from "vue";

const trackEl = ref<HTMLDivElement>();
const thumbEl = ref<HTMLDivElement>();

const ratio = defineModel<number>("ratio", { required: false, default: 0 });
const isGrabbing = ref(false);

const handleStartGrab = () => {
  if (!thumbEl.value) return;

  isGrabbing.value = true;

  const onMouseMove = (e: MouseEvent) => {
    if (!isGrabbing.value || !trackEl.value) return;

    const trackRect = trackEl.value.getBoundingClientRect();
    let mouseX = e.clientX - trackRect.left;
    mouseX = Math.max(0, Math.min(mouseX, trackRect.width));
    const newRatio = (mouseX / trackRect.width) * 2 - 1;
    ratio.value = newRatio;
  };

  const onMouseUp = () => {
    isGrabbing.value = false;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  };

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
};

const handleTrackClick = (e: MouseEvent) => {
  if (!trackEl.value || isGrabbing.value) return;

  const trackRect = trackEl.value.getBoundingClientRect();
  const clickX = e.clientX - trackRect.left;
  const newRatio = (clickX / trackRect.width) * 2 - 1;
  ratio.value = Math.max(-1, Math.min(1, newRatio));
};

const thumbCorrection = computed(() => {
  if (!trackEl.value || !thumbEl.value) return 0.04;
  return thumbEl.value.clientWidth / 2 / trackEl.value.clientWidth;
});

const thumbLeft = computed(() => {
  return ratio.value * 50 + 50 - thumbCorrection.value * 100;
});
</script>

<template>
  <div>
    <div
      ref="trackEl"
      :class="[
        {
          'cursor-pointer': !isGrabbing,
          'cursor-grabbing': isGrabbing,
        },
      ]"
      class="rounded-lg bg-highlight-darkest h-2 w-full select-none position-relative"
      @click="handleTrackClick"
    >
      <div
        ref="thumbEl"
        :class="[
          {
            'cursor-grabbing scale-110': isGrabbing,
          },
        ]"
        :style="{
          left: `${thumbLeft}%`,
        }"
        class="rounded-full bg-highlight-content h-4 w-4 aspect-ratio-square cursor-grab transition-transform absolute -top-1/2"
        @mousedown="handleStartGrab"
      />
    </div>
  </div>
</template>
