<script setup lang="ts">
import Toast from "@/app/components/Toast.vue";
import { SidebarProvider } from "@/app/components/ui/sidebar";
import { useCookies } from "@vueuse/integrations/useCookies";
import { computed } from "vue";

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
      class="bg-highlight h-screen max-h-screen max-w-screen min-h-screen min-w-screen w-screen overflow-x-hidden overflow-y-auto"
    >
      <slot /></div
  ></SidebarProvider>
  <Toast />
</template>
