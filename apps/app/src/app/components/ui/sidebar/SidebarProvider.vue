<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { useEventListener, useMediaQuery } from "@vueuse/core";
import { TooltipProvider } from "reka-ui";
import { computed, ref, shallowRef, watchEffect } from "vue";
import { cn } from "@/app/utils/lib/utils";
import {
  provideSidebarContext,
  SIDEBAR_KEYBOARD_SHORTCUT,
  SIDEBAR_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_WIDTH_ICON,
  SIDEBAR_WIDTH_MOBILE,
} from "./utils";
import { usePageContext } from "vike-vue/usePageContext";

const props = withDefaults(
  defineProps<{
    id: string;
    defaultOpen?: boolean;
    inline?: boolean;
    class?: HTMLAttributes["class"];
  }>(),
  {
    defaultOpen: undefined,
    inline: false,
  },
);

const ctx = usePageContext();

const isMobile = !ctx.isClientSide
  ? shallowRef(ctx.isMobile)
  : useMediaQuery("(max-width: 768px)");
const openMobile = ref(false);

const open = defineModel<boolean>({ default: true });

function setOpen(value: boolean) {
  open.value = value;
}

function setOpenMobile(value: boolean) {
  openMobile.value = value;
}

// Helper to toggle the sidebar.
function toggleSidebar() {
  return isMobile.value
    ? setOpenMobile(!openMobile.value)
    : setOpen(!open.value);
}

useEventListener("keydown", (event: KeyboardEvent) => {
  if (
    event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
    (event.metaKey || event.ctrlKey)
  ) {
    event.preventDefault();
    toggleSidebar();
  }
});

// We add a state so that we can do data-state="expanded" or "collapsed".
// This makes it easier to style the sidebar with Tailwind classes.
const state = computed(() => (open.value ? "expanded" : "collapsed"));

const width = defineModel<number>("width", { default: SIDEBAR_WIDTH });
const minWidth = defineModel<number>("minWidth", {
  default: SIDEBAR_MIN_WIDTH,
});
const maxWidth = defineModel<number>("maxWidth", {
  default: SIDEBAR_MAX_WIDTH,
});
const widthIcon = defineModel<number>("widthIcon", {
  default: SIDEBAR_WIDTH_ICON,
});
const widthMobile = defineModel<number>("widthMobile", {
  default: SIDEBAR_WIDTH_MOBILE,
});
const side = defineModel<"left" | "right">("side", { default: "left" });

watchEffect(() => {
  if (maxWidth.value < minWidth.value) {
    maxWidth.value = minWidth.value;
  }

  if (width.value < minWidth.value) {
    width.value = minWidth.value;
  } else if (width.value > maxWidth.value) {
    width.value = maxWidth.value;
  }
});

provideSidebarContext(props.id, {
  state,
  open,
  setOpen,
  isMobile,
  openMobile,
  setOpenMobile,
  toggleSidebar,
  width,
  minWidth,
  maxWidth,
  widthIcon,
  widthMobile,
  side,
});
</script>

<template>
  <TooltipProvider :delay-duration="0">
    <div
      data-slot="sidebar-wrapper"
      :class="
        cn(
          'group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar',
          props.class,
        )
      "
      v-bind="$attrs"
    >
      <slot />
    </div>
  </TooltipProvider>
</template>
