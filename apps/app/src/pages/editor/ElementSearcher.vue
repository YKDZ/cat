<script setup lang="ts">
import { Input } from "@cat/ui";
import { Search } from "@lucide/vue";
import { useDebounceFn } from "@vueuse/core";
import { storeToRefs } from "pinia";
import { navigate } from "vike/client/router";
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import { useEditorContextStore } from "@/stores/editor/context";

import { buildEditorHref } from "./scope-url";

const { t } = useI18n();

const contextStore = useEditorContextStore();
const { searchQuery } = storeToRefs(contextStore);
const localQuery = ref(searchQuery.value);

watch(searchQuery, (value) => {
  if (value !== localQuery.value) {
    localQuery.value = value;
  }
});

const commitSearch = useDebounceFn(async (value: string) => {
  contextStore.setSearchQuery(value);
  contextStore.setCurrentPage(1);
  if (contextStore.scope) {
    await navigate(buildEditorHref(contextStore.scope, "auto"));
  }
}, 250);

watch(localQuery, (value) => {
  void commitSearch(value);
});
</script>

<template>
  <div class="relative w-full max-w-sm items-center">
    <Input
      class="rounded-none pl-8"
      type="text"
      :placeholder="t('搜索可翻译元素...')"
      v-model.trim="localQuery"
    />
    <span
      class="absolute inset-y-0 start-0 flex items-center justify-center px-2"
    >
      <Search class="size-4" />
    </span>
  </div>
</template>
