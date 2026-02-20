<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import { useEditorTermStore } from "@/app/stores/editor/term.ts";
import { Input } from "@/app/components/ui/input";
import { Search } from "lucide-vue-next";

const { t } = useI18n();

const { searchQuery } = storeToRefs(useEditorTermStore());
const { searchTerm } = useEditorTermStore();

const handleSearch = () => {
  searchTerm();
};
</script>

<template>
  <div class="relative w-full max-w-sm items-center">
    <Input
      class="rounded-none pl-8"
      type="text"
      :placeholder="t('搜索术语')"
      v-model.trim="searchQuery"
      @change="handleSearch"
    />
    <span
      class="absolute inset-s-0 inset-y-0 flex items-center justify-center px-2"
    >
      <Search class="size-4" />
    </span>
  </div>
</template>
