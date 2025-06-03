<script setup lang="ts">
import AdminSettingsBoolean from "@/app/components/AdminSettingsBoolean.vue";
import AdminSettingsPicker from "@/app/components/AdminSettingsPicker.vue";
import AdminSettingsString from "@/app/components/AdminSettingsString.vue";
import AdminSettingsTitle from "@/app/components/AdminSettingsTitle.vue";
import AdminSettingsURL from "@/app/components/AdminSettingsURL.vue";
</script>

<template>
  <div class="py-6 flex flex-col gap-2">
    <AdminSettingsTitle>储存设置</AdminSettingsTitle>
    <div class="px-4 flex flex-col gap-2 w-full">
      <AdminSettingsPicker
        setting-key="server.storage-type"
        :zod-enum="['LOCAL', 'S3']"
        label="储存类型"
        :options="[
          {
            value: 'S3',
            content: 'S3',
          },
          {
            value: 'LOCAL',
            content: '本地',
          },
        ]"
      />
    </div>
    <AdminSettingsTitle>S3 设置</AdminSettingsTitle>
    <div class="px-4 flex flex-col gap-2 w-full">
      <AdminSettingsURL
        setting-key="s3.endpoint-url"
        icon="i-mdi:link"
        label="S3 URL"
      />
      <AdminSettingsString
        setting-key="s3.bucket-name"
        icon="i-mdi:bucket"
        label="储存桶 ID"
      />
      <AdminSettingsString
        setting-key="s3.region"
        icon="i-mdi:earth"
        label="储存桶区域"
      />
      <AdminSettingsString
        setting-key="s3.access-key-id"
        icon="i-mdi:id-card"
        label="令牌 ID"
      />
      <AdminSettingsString
        setting-key="s3.secret-access-key"
        icon="i-mdi:key"
        label="令牌密钥"
      />
      <AdminSettingsBoolean
        setting-key="s3.force-path-style"
        icon="i-mdi:path"
        label="强制路径样式"
      />
    </div>
  </div>
</template>
