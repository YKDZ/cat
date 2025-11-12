<script setup lang="ts">
import { SidebarProvider } from "@/app/components/ui/sidebar";
import { useCookies } from "@vueuse/integrations/useCookies";
import { computed } from "vue";
import { Toaster } from "@/app/components/ui/sonner";

const sidebarState = useCookies(["sidebarState"]);

const defaultOpen = computed(() => {
  return sidebarState.get<boolean>("sidebarState");
});
</script>

<template>
  <SidebarProvider
    :default-open
    @update:open="(value) => sidebarState.set('sidebarState', value)"
  >
    <div
      class="bg-background h-screen max-h-screen max-w-screen min-h-screen min-w-screen w-screen overflow-x-hidden overflow-y-auto"
    >
      <slot /></div
  ></SidebarProvider>
  <Toaster class="pointer-events-auto" />
</template>
