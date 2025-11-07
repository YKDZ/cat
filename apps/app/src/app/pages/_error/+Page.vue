<script lang="ts" setup>
import { usePageContext } from "vike-vue/usePageContext";
import { useI18n } from "vue-i18n";
import { Button } from "@/app/components/ui/button";

const ctx = usePageContext();

const { t } = useI18n();

const { is404, abortReason } = ctx;

const handleBack = () => {
  window.history.back();
};
</script>

<template>
  <p>{{ (abortReason ?? is404) ? t("页面不存在") : t("页面出错了") }}</p>
  <Button @click="handleBack"
    ><div class="icon-[mdi--arrow-left] size-4" />
    {{ t("返回上一页") }}</Button
  >
</template>
