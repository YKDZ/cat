<script setup lang="ts">
import { useI18n } from "vue-i18n";

/**
 * @zh 项目子页数据错误态的属性。
 * @en Props for the project child page data error state.
 */
defineProps<{
  /**
   * @zh 错误消息。
   * @en Error message.
   */
  message: string;
}>();

const { t } = useI18n();
</script>

<template>
  <section
    role="alert"
    class="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive"
  >
    <h2 class="font-medium">{{ t("页面数据加载失败") }}</h2>
    <p class="mt-1 text-sm">{{ message }}</p>
  </section>
</template>
