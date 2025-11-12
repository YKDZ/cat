<script setup lang="ts">
import { Input } from "@/app/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
  PaginationFirst,
  PaginationLast,
} from "@/app/components/ui/pagination";
import { useEditorContextStore } from "@/app/stores/editor/context";
import { useEditorTableStore } from "@/app/stores/editor/table";
import {
  ChevronRightIcon,
  ChevronLeftIcon,
  ChevronsRightIcon,
  ChevronsLeftIcon,
} from "lucide-vue-next";
import { storeToRefs } from "pinia";
import { computed } from "vue";

const { currentPage } = storeToRefs(useEditorContextStore());
const { elementTotalAmount, pageTotalAmount } = storeToRefs(
  useEditorTableStore(),
);

const { toPage } = useEditorTableStore();

const onInputChange = (value: number) => {
  if (value < 1 || value > pageTotalAmount.value) currentPage.value = 1;
  toPage(value - 1);
};
</script>

<template>
  <Pagination
    :items-per-page="16"
    :total="elementTotalAmount"
    :sibling-count="0"
    v-model:page="currentPage"
  >
    <PaginationContent>
      <PaginationFirst @click="toPage(0)">
        <ChevronsLeftIcon />
      </PaginationFirst>
      <PaginationPrevious size="icon" @click="toPage(currentPage - 1)">
        <ChevronLeftIcon />
      </PaginationPrevious>

      <Input
        type="text"
        class="w-[10ch] text-center"
        v-model="currentPage"
        @change="onInputChange"
      />

      <PaginationNext @click="toPage(currentPage - 1)">
        <ChevronRightIcon />
      </PaginationNext>
      <PaginationLast @click="toPage(pageTotalAmount - 1)">
        <ChevronsRightIcon />
      </PaginationLast>
    </PaginationContent>
  </Pagination>
</template>
