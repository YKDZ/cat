<script setup lang="ts">
import AdminSettingForm from "@/app/components/AdminSettingForm.vue";
import AdminSettingsTitle from "@/app/components/AdminSettingsTitle.vue";
import { z } from "zod/v4";
</script>

<template>
  <div class="py-6 flex flex-col gap-2">
    <AdminSettingsTitle>{{ $t("站点设置") }}</AdminSettingsTitle>
    <AdminSettingForm
      config-key="server.name"
      :schema="z.toJSONSchema(z.string().meta({ title: $t('站点名称') }))"
    />
    <AdminSettingForm
      config-key="server.url"
      :schema="z.toJSONSchema(z.url().meta({ title: $t('站点地址') }))"
    />
    <AdminSettingForm
      config-key="server.default-language"
      :schema="z.toJSONSchema(z.url().meta({ title: $t('默认语言') }))"
    />
  </div>
</template>
