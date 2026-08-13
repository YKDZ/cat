<script setup lang="ts">
import { SidebarProvider } from "@cat/ui";
import { Toaster } from "@cat/ui";
import { usePageContext } from "vike-vue/usePageContext";
import { computed, defineAsyncComponent, onMounted, onUnmounted } from "vue";

// Only load devtools in development — avoids bundling ~2 MB of devtools panel
// into the production SSR and client builds. Dead code elimination removes the
// dynamic import() branch when import.meta.env.DEV is false at build time.
const PiniaColadaDevtools =
  import.meta.env.DEV && import.meta.env.VITE_E2E !== "true"
    ? defineAsyncComponent(() =>
        import("@pinia/colada-devtools").then((m) => m.PiniaColadaDevtools),
      )
    : null;

import { isExpectedNavigationCancellation } from "#/rpc/request-cancellation.ts";
import { connectWs } from "#/rpc/ws.ts";
import { useNotificationStore } from "#/stores/notification.ts";
import { useCookieBooleanRef } from "#/utils/cookie.ts";
import { clientLogger } from "#/utils/logger.ts";

const ctx = usePageContext();
const notificationStore = useNotificationStore();
const logger = clientLogger.child({ component: "root-layout" });

const initializeNotifications = async (): Promise<void> => {
  if (!ctx.user) return;
  connectWs();
  try {
    await notificationStore.loadInitial();
  } catch (error) {
    if (isExpectedNavigationCancellation(error)) return;
    throw error;
  }
  notificationStore.startStreaming();
};

const resumeNotifications = (event: PageTransitionEvent): void => {
  if (!event.persisted) return;
  void initializeNotifications().catch((error: unknown) => {
    logger.error("Failed to initialize notifications after BFCache restore", {
      error,
    });
  });
};

const suspendNotifications = (): void => {
  notificationStore.stopStreaming();
};

onMounted(async () => {
  window.addEventListener("pagehide", suspendNotifications);
  window.addEventListener("pageshow", resumeNotifications);
  await initializeNotifications();
});

onUnmounted(() => {
  window.removeEventListener("pagehide", suspendNotifications);
  window.removeEventListener("pageshow", resumeNotifications);
  notificationStore.stopStreaming();
});

const withBooleanDefault = (value: ReturnType<typeof useCookieBooleanRef>) =>
  computed({
    get: () => value.value ?? true,
    set: (next: boolean) => {
      value.value = next;
    },
  });

const indexSidebarOpen = withBooleanDefault(
  useCookieBooleanRef(ctx, "indexSidebarOpen", true),
);
const editorSidebarOpen = withBooleanDefault(
  useCookieBooleanRef(ctx, "editorSidebarOpen", true),
);
const editorContextPanelOpen = withBooleanDefault(
  useCookieBooleanRef(ctx, "editorContextPanelOpen", true),
);
const adminSidebarOpen = withBooleanDefault(
  useCookieBooleanRef(ctx, "adminSidebarOpen", true),
);
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
            class="h-screen max-h-screen min-h-screen w-screen max-w-screen min-w-screen overflow-x-hidden overflow-y-auto bg-background"
          >
            <slot /></div></SidebarProvider></SidebarProvider></SidebarProvider
  ></SidebarProvider>
  <Toaster class="pointer-events-auto" />

  <component :is="PiniaColadaDevtools" v-if="PiniaColadaDevtools" />
</template>
