<script setup lang="ts">
import AdminSettingsString from "@/app/components/AdminSettingsString.vue";
import AdminSettingsTitle from "@/app/components/AdminSettingsTitle.vue";
</script>

<template>
  <div class="py-6 flex flex-col gap-2">
    <AdminSettingsTitle>站点设置</AdminSettingsTitle>
    <div class="px-4 flex flex-col gap-2 w-full">
      <AdminSettingsString
        setting-key="server.name"
        icon="i-mdi:link"
        label="站点名称"
      />
      <AdminSettingsString
        setting-key="server.url"
        icon="i-mdi:bucket"
        label="站点 URL"
      />
    </div>
  </div>
</template>
