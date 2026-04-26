<script setup lang="ts">
import { useI18n } from "vue-i18n";

import ApiKeyManager from "./ApiKeyManager.vue";
import MfaSettings from "./MfaSettings.vue";
import SessionList from "./SessionList.vue";

const { t } = useI18n();
</script>

<template>
  <div class="space-y-10 p-4">
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">{{ t("活跃会话") }}</h2>
      <SessionList />
    </section>
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">{{ t("API 密钥") }}</h2>
      <ApiKeyManager />
    </section>
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">{{ t("多因素认证") }}</h2>
      <MfaSettings />
    </section>
  </div>
</template>
