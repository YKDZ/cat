<script setup>
import { computed, ref, onMounted, onUnmounted } from "vue";

const props = defineProps({
  size: {
    type: String,
    default: "auto",
  },
  spinColor: {
    type: String,
    default: "var(--cat-theme-base)",
  },
  trackColor: {
    type: String,
    default: "var(--cat-theme-highlight)",
  },
  backgroundColor: {
    type: String,
    default: "transparent",
  },
});

const containerRef = ref(null);
const containerSize = ref(0);

onMounted(() => {
  if (props.size === "auto") {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        containerSize.value = Math.min(width, height);
      }
    });
    if (containerRef.value) {
      observer.observe(containerRef.value);
    }
    onUnmounted(() => {
      observer.disconnect();
    });
  }
});

const parsedSize = computed(() => {
  if (props.size === "auto") {
    return { value: 0, unit: "px" };
  }
  const sizeValue = parseFloat(props.size);
  const sizeUnit = props.size.replace(sizeValue.toString(), "") || "px";
  return { value: sizeValue, unit: sizeUnit };
});

const dynamicBorderRatioAuto = computed(() => {
  const baseSize = containerSize.value;
  return 0.08 + (Math.log(baseSize + 10) / Math.log(100)) * 0.01;
});

const dynamicBorderRatio = computed(() => {
  const baseSize = parsedSize.value.value;
  return 0.08 + (Math.log(baseSize + 10) / Math.log(100)) * 0.01;
});

const dynStyle = computed(() => {
  if (props.size === "auto") {
    const sizeValue = containerSize.value;
    if (sizeValue === 0) return {};
    const borderWidth = sizeValue * dynamicBorderRatioAuto.value;
    return {
      width: `${sizeValue * 0.8}px`,
      height: `${sizeValue * 0.8}px`,
      borderWidth: `${borderWidth.toFixed(2)}px`,
    };
  } else {
    const { value: sizeValue, unit } = parsedSize.value;
    const borderWidth = sizeValue * dynamicBorderRatio.value;
    return {
      width: `${sizeValue * 0.8}${unit}`,
      height: `${sizeValue * 0.8}${unit}`,
      borderWidth: `${borderWidth.toFixed(2)}${unit}`,
    };
  }
});
</script>

<template>
  <span
    class="rounded-full inline-block box-border animate-spin"
    :style="[
      dynStyle,
      {
        'border-color': trackColor,
        'border-bottom-color': spinColor,
        'background-color': backgroundColor,
      },
    ]"
  />
</template>
