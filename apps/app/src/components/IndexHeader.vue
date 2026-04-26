<script setup lang="ts">
import { SidebarTrigger } from "@cat/ui";

import NotificationInbox from "@/components/NotificationInbox.vue";
</script>

<template>
  <div class="header flex items-center justify-between">
    <SidebarTrigger sidebar-id="index" />
    <NotificationInbox />
  </div>
</template>
