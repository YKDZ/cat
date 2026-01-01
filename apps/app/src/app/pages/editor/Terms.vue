<script setup lang="ts">
import { useI18n } from "vue-i18n";
import TermList from "./TermList.vue";
import TermSearcher from "./TermSearcher.vue";

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col gap-2 p-3 pb-0">
    <h3 class="text-sm font-bold">{{ t("术语") }}</h3>
    <TermSearcher />
    <TermList />
  </div>
</template>
