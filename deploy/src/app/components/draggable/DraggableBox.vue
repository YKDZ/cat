<script setup lang="ts">
import { computed } from "vue";
import { useEventListener } from "@vueuse/core";
import { DraggableBoxData } from ".";

const props = defineProps<{ box: DraggableBoxData }>();

const emits = defineEmits<{
  (e: "update", box: DraggableBoxData): void;
  (e: "drag-end", evt: PointerEvent): void;
}>();

// 拖拽
let startX = 0,
  startY = 0;
const onDragStart = (e: PointerEvent) => {
  e.preventDefault();
  startX = e.clientX - props.box.x;
  startY = e.clientY - props.box.y;
  useEventListener(window, "pointermove", onDragging, { passive: false });
  useEventListener(window, "pointerup", onDragEnd);
};

const onDragging = (e: PointerEvent) => {
  e.preventDefault();

  const box = {
    ...props.box,
    floating: true,
    x: e.clientX - startX,
    y: e.clientY - startY,
  };

  emits("update", box);
};

const onDragEnd = (e: PointerEvent) => {
  emits("drag-end", e);
};

let startW = 0,
  startH = 0;
const onResizeStart = (e: PointerEvent) => {
  e.preventDefault();
  startW = props.box.width;
  startH = props.box.height;
  startX = e.clientX;
  startY = e.clientY;
  useEventListener(window, "pointermove", onResizing, { passive: false });
  useEventListener(window, "pointerup", () => {}, { once: true });
};

const onResizing = (e: PointerEvent) => {
  const box = {
    ...props.box,
    width: Math.max(50, startW + (e.clientX - startX)),
    height: Math.max(50, startH + (e.clientY - startY)),
  };

  emits("update", box);
};

// 样式
const boxStyle = computed(() => ({
  width: props.box.width + "px",
  height: props.box.height + "px",
  left: props.box.floating ? props.box.x + "px" : undefined,
  top: props.box.floating ? props.box.y + "px" : undefined,
  order: props.box.floating ? undefined : (props.box.index ?? 0),
}));
</script>

<template>
  <div
    :class="['box', { floating: box.floating }]"
    :style="boxStyle"
    @pointerdown.stop="onDragStart"
  >
    <div class="content">
      {{ box.id }}
    </div>
    <div class="resizer" @pointerdown.stop="onResizeStart"></div>
  </div>
</template>

<style scoped>
.box {
  border: 1px solid #888;
  background: #f8f8f8;
  position: relative;
  user-select: none;
}

.box.floating {
  position: absolute;
  z-index: 10;
}

.content {
  padding: 8px;
}

.resizer {
  width: 12px;
  height: 12px;
  position: absolute;
  right: 0;
  bottom: 0;
  cursor: se-resize;
  background: #666;
}
</style>
