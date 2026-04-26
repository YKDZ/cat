<script setup lang="ts">
import { useI18n } from "vue-i18n";

import logoUrl from "@/assets/logo.png";

import AuthFlowRenderer from "./AuthFlowRenderer.vue";

const { t } = useI18n();
</script>

<template>
  <div class="flex w-full flex-col items-center gap-4 px-10 md:w-1/3 md:px-0">
    <img :src="logoUrl" class="w-12" />
    <h1 class="text-3xl select-none">
      {{ t("登录") }}
    </h1>
    <AuthFlowRenderer flow-type="login" />
  </div>
</template>
