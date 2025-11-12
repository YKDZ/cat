<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { ref } from "vue";
import { Input } from "@/app/components/ui/input";
import { Search } from "lucide-vue-next";
import { useEditorContextStore } from "@/app/stores/editor/context";

const { t } = useI18n();

const { searchQuery } = storeToRefs(useEditorTableStore());
const { currentPage } = storeToRefs(useEditorContextStore());
const { toPage } = useEditorTableStore();
const isSearching = ref(false);

const handleSearch = async () => {
  isSearching.value = true;
  await toPage(0);
  currentPage.value = 1;
  isSearching.value = false;
};
</script>

<template>
  <div class="relative w-full max-w-sm items-center">
    <Input
      class="rounded-none pl-8"
      type="text"
      :placeholder="t('搜索可翻译元素')"
      v-model.trim="searchQuery"
      @change="handleSearch"
    />
    <span
      class="absolute start-0 inset-y-0 flex items-center justify-center px-2"
    >
      <Search class="size-4" />
    </span>
  </div>
</template>
