<script setup lang="ts">
import { Loader2 } from "lucide-vue-next";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col items-center gap-4 py-8">
    <Loader2 class="size-8 animate-spin text-muted-foreground" />
    <p class="text-sm text-muted-foreground">
      {{ t("正在跳转到身份提供方...") }}
    </p>
  </div>
</template>
