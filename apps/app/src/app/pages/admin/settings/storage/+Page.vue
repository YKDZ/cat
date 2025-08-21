<script setup lang="ts">
import AdminSettingForm from "@/app/components/AdminSettingForm.vue";
import AdminSettingsTitle from "@/app/components/AdminSettingsTitle.vue";
import { onMounted } from "vue";
import { z } from "zod";

const storage = z.toJSONSchema(
  z.object({
    "server.storage-type": z.enum(["LOCAL", "S3"]).meta({ title: "储存类型" }),
  }),
);

const s3 = z.toJSONSchema(
  z.object({
    "s3.endpoint-url": z.url().meta({ title: "端点 URL" }),
    "s3.bucket-name": z.string().meta({ title: "储存桶 ID" }),
    "s3.region": z.string().meta({ title: "储存桶区域" }),
    "s3.acl": z
      .enum([
        "authenticated-read",
        "aws-exec-read",
        "bucket-owner-full-control",
        "bucket-owner-read",
        "private",
        "public-read",
        "public-read-write",
      ])
      .meta({ title: "储存桶 ACL" }),
    "s3.access-key-id": z.string().meta({ title: "令牌 ID" }),
    "s3.secret-access-key": z
      .string()
      .meta({ title: "令牌密钥", "x-secret": true }),
    "s3.force-path-style": z.boolean().meta({ title: "强制路径样式" }),
  }),
);
</script>

<template>
  <div class="py-6 flex flex-col gap-2">
    <AdminSettingsTitle>{{ $t("储存设置") }}</AdminSettingsTitle>
    <AdminSettingForm :schema="storage" />
    <AdminSettingsTitle>{{ $t("S3 设置") }}</AdminSettingsTitle>
    <AdminSettingForm :schema="s3" />
  </div>
</template>
