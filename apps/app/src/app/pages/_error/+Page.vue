<script lang="ts" setup>
import HButton from "@/app/components/headless/HButton.vue";
import { usePageContext } from "vike-vue/usePageContext";

const ctx = usePageContext();

let { is404, abortReason } = ctx;

if (!abortReason) {
  abortReason = is404 ? "页面不存在" : "出错了";
}

const handleBack = () => {
  window.history.back();
};
</script>

<template>
  <p>{{ abortReason }}</p>
  <HButton
    :classes="{
      base: 'btn btn-md btn-base',
    }"
    icon="i-mdi:arrow-left"
    @click="handleBack"
    >返回上一页</HButton
  >
</template>
