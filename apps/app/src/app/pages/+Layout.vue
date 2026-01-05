<script setup lang="ts">
import { SidebarProvider } from "@/app/components/ui/sidebar";
import { Toaster } from "@/app/components/ui/sonner";
import { useCookieBooleanRef } from "@/app/utils/cookie";
import { usePageContext } from "vike-vue/usePageContext";
import { PiniaColadaDevtools } from "@pinia/colada-devtools";

const ctx = usePageContext();

const indexSidebarOpen = useCookieBooleanRef(
  usePageContext(),
  "indexSidebarOpen",
  true,
);
const editorSidebarOpen = useCookieBooleanRef(ctx, "editorSidebarOpen", true);
const editorContextPanelOpen = useCookieBooleanRef(
  ctx,
  "editorContextPanelOpen",
  true,
);
const adminSidebarOpen = useCookieBooleanRef(ctx, "adminSidebarOpen", true);
</script>

<template>
  <SidebarProvider id="index" v-model="indexSidebarOpen">
    <SidebarProvider
      id="editor-context-panel"
      v-model="editorContextPanelOpen"
      :width="320"
      side="right"
    >
      <SidebarProvider id="editor" v-model="editorSidebarOpen">
        <SidebarProvider id="admin" v-model="adminSidebarOpen">
          <div
            class="bg-background h-screen max-h-screen max-w-screen min-h-screen min-w-screen w-screen overflow-x-hidden overflow-y-auto"
          >
            <slot /></div></SidebarProvider></SidebarProvider></SidebarProvider
  ></SidebarProvider>
  <Toaster class="pointer-events-auto" />

  <PiniaColadaDevtools />
</template>
