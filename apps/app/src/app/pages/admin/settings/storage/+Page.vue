<script setup lang="ts">
import AdminSettingForm from "@/app/components/AdminSettingForm.vue";
import AdminSettingsTitle from "@/app/components/AdminSettingsTitle.vue";
import { z } from "zod/v4";
</script>

<template>
  <div class="py-6 flex flex-col gap-2">
    <AdminSettingsTitle>储存设置</AdminSettingsTitle>
    <AdminSettingForm
      config-key="server.storage-type"
      :schema="
        z.toJSONSchema(z.enum(['LOCAL', 'S3']).meta({ title: '储存类型' }))
      "
    />
    <AdminSettingsTitle>S3 设置</AdminSettingsTitle>
    <AdminSettingForm
      config-key="s3.endpoint-url"
      :schema="z.toJSONSchema(z.url().meta({ title: '端点 URL' }))"
    />
    <AdminSettingForm
      config-key="s3.bucket-name"
      :schema="z.toJSONSchema(z.string().meta({ title: '储存桶 ID' }))"
    />
    <AdminSettingForm
      config-key="s3.region"
      :schema="z.toJSONSchema(z.string().meta({ title: '储存桶区域' }))"
    />
    <AdminSettingForm
      config-key="s3.access-key-id"
      :schema="z.toJSONSchema(z.string().meta({ title: '令牌 ID' }))"
    />
    <AdminSettingForm
      config-key="s3.secret-access-key"
      :schema="z.toJSONSchema(z.string().meta({ title: '令牌密钥' }))"
    />
    <AdminSettingForm
      config-key="s3.force-path-style"
      :schema="z.toJSONSchema(z.boolean().meta({ title: '强制路径样式' }))"
    />
  </div>
</template>
