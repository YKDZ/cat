<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";

import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useEditorTermStore } from "@/app/stores/editor/term.ts";
import { watchClient } from "@/app/utils/vue.ts";

import TermListItem from "./TermListItem.vue";

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
      {{ t("没有找到可用的术语") }}
    </div>
  </div>
</template>
