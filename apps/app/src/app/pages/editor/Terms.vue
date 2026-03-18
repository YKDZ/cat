<script setup lang="ts">
import { useI18n } from "vue-i18n";

import TermList from "./TermList.vue";
import TermSearcher from "./TermSearcher.vue";
import TermSettings from "./TermSettings.vue";

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col gap-2 p-3 pb-0">
    <h3 class="inline-flex items-center gap-2 text-sm font-bold">
      <span>{{ t("术语") }}</span>
      <TermSettings />
    </h3>
    <TermSearcher />
    <TermList />
  </div>
</template>
