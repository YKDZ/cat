<script setup lang="ts">
import { navigate } from "vike/client/router";
import { useI18n } from "vue-i18n";
import HButton from "./headless/HButton.vue";

const { t } = useI18n();

const handleNav = async () => {
  await navigate("/admin");
};
</script>

<template>
  <HButton
    :classes="{
      base: 'btn btn-md btn-left btn-w-full btn-transparent btn-none-rounded',
      icon: 'btn-icon btn-icon-lg',
    }"
    icon="icon-[mdi--cog]"
    @click="handleNav"
  >
    {{ t("管理") }}
  </HButton>
</template>
