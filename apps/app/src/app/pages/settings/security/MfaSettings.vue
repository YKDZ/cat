<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<template>
  <div class="text-sm text-muted-foreground">
    {{ t("MFA 设置功能即将推出") }}
  </div>
</template>
