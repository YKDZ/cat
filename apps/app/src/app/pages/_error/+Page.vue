<script lang="ts" setup>
import { usePageContext } from "vike-vue/usePageContext";
import { useI18n } from "vue-i18n";
import HButton from "@/app/components/headless/HButton.vue";

const ctx = usePageContext();

const { t } = useI18n();

const { is404, abortReason } = ctx;

const handleBack = () => {
  window.history.back();
};
</script>

<template>
  <p>{{ (abortReason ?? is404) ? t("页面不存在") : t("页面出错了") }}</p>
  <HButton
    :classes="{
      base: 'btn btn-md btn-base',
    }"
    icon="i-mdi:arrow-left"
    @click="handleBack"
    >{{ t("返回上一页") }}</HButton
  >
</template>
