<script setup lang="ts">
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();


onMounted(() => {
  window.location.href = "/auth/flow";
});
</script>

<template>
  <div class="flex h-screen items-center justify-center">
    <span class="text-muted-foreground">{{ t("重定向中…") }}</span>
  </div>
</template>
