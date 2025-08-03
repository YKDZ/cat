<script setup lang="ts">
import AdminSettingForm from "@/app/components/AdminSettingForm.vue";
import AdminSettingsTitle from "@/app/components/AdminSettingsTitle.vue";
import { z } from "zod";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const site = z.toJSONSchema(
  z.object({
    "server.name": z.string().meta({ title: t("站点名称") }),
    "server.url": z.url().meta({ title: t("站点地址") }),
    "server.default-language": z.url().meta({ title: t("默认语言") }),
  }),
);
</script>

<template>
  <div class="py-6 flex flex-col gap-2">
    <AdminSettingsTitle>{{ $t("站点设置") }}</AdminSettingsTitle>
    <AdminSettingForm :schema="site" />
  </div>
</template>
