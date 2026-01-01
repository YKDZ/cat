<script setup lang="ts">
import * as z from "zod/v4";
import { useI18n } from "vue-i18n";
import SettingForm from "../SettingForm.vue";

const { t } = useI18n();

const site = z.toJSONSchema(
  z
    .object({
      "server.name": z.string().meta({
        title: t("站点名称"),
        description: t("在侧边栏、页面标签等位置显示的网页名称"),
      }),
      "server.url": z.url().meta({
        title: t("站点地址"),
        description: t("站点的最终公开可访问地址，常作为 OAuth 等协议的回调"),
      }),
      "server.default-language": z.url().meta({
        title: t("默认语言"),
        description: t("在无法自动推测用户的语言时，采取的默认显示语言"),
      }),
    })
    .meta({
      title: t("站点设置"),
      description: t("与 CAT 站点本身的外观等有关的设置"),
    }),
);
</script>

<template>
  <SettingForm :schema="site" />
</template>
