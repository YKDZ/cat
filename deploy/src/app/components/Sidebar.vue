<script setup lang="ts">
import { storeToRefs } from "pinia";
import { onMounted, ref, watch } from "vue";
import { useSidebarStore } from "../stores/sidebar";
import { isLowWidth } from "../utils/window";

const props = defineProps({
  minWidth: {
    type: Number,
    default: 150,
  },
  maxWidth: {
    type: Number,
    default: 800,
  },
});

const sidebarContainer = ref<HTMLDivElement>();
const sidebarEl = ref<HTMLDivElement>();
const layerEl = ref<HTMLDivElement>();

const mouseInSidebar = defineModel("mouseInSidebar", { type: Boolean });
const { isFree, isFolding, realIsFolding, width } =
  storeToRefs(useSidebarStore());
const { changeFold } = useSidebarStore();

const isResizing = defineModel("isResizing", { type: Boolean, default: false });

const handleMouseEnter = () => {
  if (isLowWidth.value) return;

  mouseInSidebar.value = true;
  if (isFree.value) isFolding.value = false;
};

const handleMouseLeave = () => {
  if (isLowWidth.value) return;

  if (!isResizing.value) {
    mouseInSidebar.value = false;
    if (isFree.value)
      setTimeout(() => {
        if (!mouseInSidebar.value) isFolding.value = true;
      }, 250);
  }
};

const startResize = (e: MouseEvent) => {
  if (isLowWidth.value) return;

  document.body.classList.add("select-none");

  isResizing.value = true;
  const startX = e.clientX;
  const startWidth = width.value;

  const onMouseMove = (e: MouseEvent) => {
    const deltaX = e.clientX - startX;
    width.value = Math.max(
      props.minWidth,
      Math.min(props.maxWidth, startWidth + deltaX),
    );

    if (width.value === props.minWidth && !isFree.value) {
      mouseInSidebar.value = false;
      isFree.value = true;
      if (!mouseInSidebar.value) isFolding.value = true;
    }
  };

  const onMouseUp = () => {
    document.body.classList.remove("select-none");

    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    isResizing.value = false;
  };

  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
};

watch(realIsFolding, (to) => changeFold(to));

// 切换为自由模式时自动收起侧边栏
watch(isFree, (to) => {
  if (to) isFolding.value = true;
});

onMounted(() => {
  if (isLowWidth.value) isFree.value = true;
});
</script>

<template>
  <!-- Under layer in mobile device -->
  <Transition>
    <div
      v-if="!realIsFolding && isFree"
      ref="layerEl"
      class="bg-black op-40 h-full w-full left-0 top-0 fixed z-40 md:hidden"
      @click="isFolding = true"
    />
  </Transition>
  <!-- Placeholder in free mode -->
  <div
    v-if="isFree"
    class="bg-highlight-darker w-0 md:w-16px"
    @mouseenter="handleMouseEnter"
  />
  <Transition>
    <!-- Sidebar -->
    <div
      v-if="!realIsFolding"
      ref="sidebarContainer"
      class="bottom-0 left-0 top-0 fixed z-50"
      :class="{
        'md:fixed md:top-0 md:left-0 md:bottom-0': isFree && !realIsFolding,
        'md:relative': !isFree,
      }"
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
    >
      <div
        ref="sidebarEl"
        class="bg-highlight-darker flex-col h-screen items-start justify-start overflow-x-hidden overflow-y-auto md:block"
        :class="{
          block: !realIsFolding,
          hidden: isFolding, // isFolding 初状态为 true
        }"
        :style="{
          width: width + `px`,
        }"
      >
        <div v-if="!isFree || !realIsFolding" class="h-full w-full">
          <slot />
        </div>
      </div>
      <!-- Dragger -->
      <div
        class="border-r-4 border-transparent bg-transparent w-1 hidden cursor-ew-resize transition-colors bottom-0 right-0 top-0 absolute z-60 hover:border-highlight-darker md:block"
        @mousedown="startResize"
      /></div
  ></Transition>
</template>

<style scoped>
.v-enter-active,
.v-leave-active {
  transition: transform 0.05s;
}

.v-enter-from,
.v-leave-to {
  transform: translateX(-100%);
}
</style>
