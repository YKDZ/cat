<script setup lang="ts">
import { Sheet, SheetContent } from "#/components/sheet/index.ts";
import SheetDescription from "#/components/sheet/SheetDescription.vue";
import SheetHeader from "#/components/sheet/SheetHeader.vue";
import SheetTitle from "#/components/sheet/SheetTitle.vue";
import type { SidebarProps } from "#/components/sidebar/index.ts";
import { useSidebar } from "#/components/sidebar/utils.ts";
import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(defineProps<SidebarProps>(), {
  variant: "sidebar",
  collapsible: "offcanvas",
});

const {
  isMobile,
  state,
  openMobile,
  setOpenMobile,
  width,
  widthIcon,
  widthMobile,
  side,
} = useSidebar(props.id);
</script>

<template>
  <div
    v-if="collapsible === 'none'"
    data-slot="sidebar"
    :style="{
      '--sidebar-width': width + 'px',
      '--sidebar-width-icon': widthIcon + 'rem',
    }"
    :class="
      cn(
        'flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground',
        props.class,
      )
    "
    v-bind="exactOptionalProps($attrs)"
  >
    <slot />
  </div>

  <Sheet
    v-else-if="isMobile"
    :open="openMobile"
    v-bind="exactOptionalProps($attrs)"
    @update:open="setOpenMobile"
    :style="{
      '--sidebar-width': width + 'px',
      '--sidebar-width-icon': widthIcon + 'rem',
    }"
  >
    <SheetContent
      data-sidebar="sidebar"
      data-slot="sidebar"
      data-mobile="true"
      :side="side"
      class="w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
      :style="{
        '--sidebar-width': widthMobile + 'rem',
      }"
    >
      <SheetHeader class="sr-only">
        <SheetTitle>Sidebar</SheetTitle>
        <SheetDescription>Displays the mobile sidebar.</SheetDescription>
      </SheetHeader>
      <div class="flex h-full w-full flex-col">
        <slot />
      </div>
    </SheetContent>
  </Sheet>

  <div
    v-else
    class="group peer hidden text-sidebar-foreground md:block"
    data-slot="sidebar"
    :data-state="state"
    :data-collapsible="state === 'collapsed' ? collapsible : ''"
    :data-variant="variant"
    :data-side="side"
    :style="{
      '--sidebar-width': width + 'px',
      '--sidebar-width-icon': widthIcon + 'rem',
    }"
  >
    <!-- This is what handles the sidebar gap on desktop  -->
    <div
      :class="
        cn(
          'relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear',
          'group-data-[collapsible=offcanvas]:w-0',
          'group-data-[side=right]:rotate-180',
          variant === 'floating' || variant === 'inset'
            ? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]'
            : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)',
        )
      "
    />
    <div
      :class="
        cn(
          'fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex',
          side === 'left'
            ? 'left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]'
            : 'right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]',
          // Adjust the padding for floating and inset variants.
          variant === 'floating' || variant === 'inset'
            ? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]'
            : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l',
          props.class,
        )
      "
      v-bind="exactOptionalProps($attrs)"
    >
      <div
        data-sidebar="sidebar"
        class="flex h-full w-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow-sm"
      >
        <slot />
      </div>
    </div>
  </div>
</template>
