<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import Translation from "./Translation.vue";
import { useEditorTranslationStore } from "@/app/stores/editor/translation.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { watchClient } from "@/app/utils/vue.ts";

const { t } = useI18n();

const { state } = storeToRefs(useEditorTranslationStore());
const { refetch } = useEditorTranslationStore();
const { elementId } = storeToRefs(useEditorTableStore());

watchClient(elementId, () => refetch(), { immediate: true });
</script>

<template>
  <div v-if="state.data" class="flex flex-col p-3">
    <h3 class="text-sm font-bold">{{ t("所有翻译") }}</h3>
    <div v-if="state.data.length === 0" class="px-3 py-2 select-none">
      {{ t("还没有任何翻译或翻译仍在处理") }}
    </div>
    <div v-else v-for="translation in state.data" :key="translation.id">
      <Translation :translation="translation" />
    </div>
  </div>
</template>
