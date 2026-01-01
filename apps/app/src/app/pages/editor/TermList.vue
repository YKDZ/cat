<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import TermListItem from "./TermListItem.vue";
import { useEditorTermStore } from "@/app/stores/editor/term.ts";
import { watchClient } from "@/app/utils/vue.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";

const { t } = useI18n();

const { elementId } = storeToRefs(useEditorTableStore());
const { terms } = storeToRefs(useEditorTermStore());
const { updateTerms } = useEditorTermStore();

watchClient(elementId, updateTerms, { immediate: true });
</script>

<template>
  <div class="flex flex-col gap-1">
    <TermListItem
      v-for="(term, index) in terms"
      :key="term.term + term.translation"
      :index
      :term
    />
    <div v-if="terms.length === 0" class="px-3 py-2">
      {{ t("还没有可用的术语") }}
    </div>
  </div>
</template>
