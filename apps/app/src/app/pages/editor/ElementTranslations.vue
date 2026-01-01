<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import ElementTranslation from "./ElementTranslation.vue";
import { useEditorTranslationStore } from "@/app/stores/editor/translation.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { watchClient } from "@/app/utils/vue.ts";

const { t } = useI18n();

const { translations } = storeToRefs(useEditorTranslationStore());
const { updateTranslations } = useEditorTranslationStore();
const { elementId } = storeToRefs(useEditorTableStore());

watchClient(elementId, updateTranslations, { immediate: true });
</script>

<template>
  <div class="flex flex-col p-3">
    <h3 class="text-sm font-bold">{{ t("所有翻译") }}</h3>
    <div v-if="translations.length === 0" class="px-3 py-2 select-none">
      {{ t("还没有任何翻译或翻译仍在处理") }}
    </div>
    <div v-else v-for="translation in translations" :key="translation.id">
      <ElementTranslation :translation="translation" />
    </div>
  </div>
</template>
