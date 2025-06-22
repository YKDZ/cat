<script setup lang="ts">
import { navigate } from "vike/client/router";
import Button from "./Button.vue";
import { ref } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const isProcessing = ref<boolean>(false);

const handleNav = () => {
  navigate("/admin");
};
</script>

<template>
  <Button
    :is-processing
    transparent
    full-width
    large
    left
    icon="i-mdi:cog"
    @click="handleNav"
  >
    {{ $t("管理") }}
  </Button>
</template>
