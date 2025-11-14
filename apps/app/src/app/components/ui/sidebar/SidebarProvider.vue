<script setup lang="ts">
import type { HTMLAttributes, Ref } from "vue";
import {
  defaultDocument,
  useEventListener,
  useMediaQuery,
  useVModel,
} from "@vueuse/core";
import { TooltipProvider } from "reka-ui";
import { computed, ref, shallowRef } from "vue";
import { cn } from "@/app/utils/lib/utils";
import {
  provideSidebarContext,
  SIDEBAR_COOKIE_MAX_AGE,
  SIDEBAR_DEFAULT_ID,
  SIDEBAR_KEYBOARD_SHORTCUT,
  SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_ICON,
  getSidebarCookieName,
} from "./utils";
import { usePageContext } from "vike-vue/usePageContext";

const props = withDefaults(
  defineProps<{
    id?: string;
    defaultOpen?: boolean;
    open?: boolean;
    inline?: boolean;
    class?: HTMLAttributes["class"];
  }>(),
  {
    id: SIDEBAR_DEFAULT_ID,
    defaultOpen: undefined,
    open: undefined,
    inline: false,
  },
);

const emits = defineEmits<{
  "update:open": [open: boolean];
}>();

const ctx = usePageContext();

const sidebarId = computed(() => props.id ?? SIDEBAR_DEFAULT_ID);
const cookieName = computed(() => getSidebarCookieName(sidebarId.value));
const initialDefaultOpen =
  props.defaultOpen ??
  !defaultDocument?.cookie.includes(`${cookieName.value}=false`);

const isMobile = !ctx.isClientSide
  ? shallowRef(ctx.isMobile)
  : useMediaQuery("(max-width: 768px)");
const openMobile = ref(false);

const open = useVModel(props, "open", emits, {
  defaultValue: initialDefaultOpen ?? false,
  passive: (props.open === undefined) as false,
}) as Ref<boolean>;

function setOpen(value: boolean) {
  open.value = value; // emits('update:open', value)

  // This sets the cookie to keep the sidebar state.
  document.cookie = `${cookieName.value}=${open.value}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
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

provideSidebarContext(sidebarId.value, {
  state,
  open,
  setOpen,
  isMobile,
  openMobile,
  setOpenMobile,
  toggleSidebar,
});
</script>

<template>
  <TooltipProvider :delay-duration="0">
    <div
      data-slot="sidebar-wrapper"
      :style="{
        '--sidebar-width': SIDEBAR_WIDTH,
        '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
      }"
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
