<script setup lang="ts">
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

const { currentPage } = storeToRefs(useEditorContextStore());
const { elementTotalAmount, pageTotalAmount } = storeToRefs(
  useEditorTableStore(),
);

const { toPage } = useEditorTableStore();
</script>

<template>
  <Pagination
    v-slot="{ page }"
    :items-per-page="16"
    :total="elementTotalAmount"
    :sibling-count="0"
    v-model:page="currentPage"
  >
    <PaginationContent v-slot="{ items }">
      <PaginationFirst @click="toPage(0)">
        <ChevronsLeftIcon />
      </PaginationFirst>
      <PaginationPrevious size="icon" @click="toPage(currentPage - 1)">
        <ChevronLeftIcon />
      </PaginationPrevious>

      <template v-for="(item, index) in items" :key="index">
        <!-- item.value 就是页码 -->
        <PaginationItem
          v-if="item.type === 'page'"
          :value="item.value"
          :is-active="item.value === page"
          @click="toPage(item.value - 1)"
        >
          {{ item.value }}
        </PaginationItem>
      </template>

      <PaginationNext @click="toPage(currentPage - 1)">
        <ChevronRightIcon />
      </PaginationNext>
      <PaginationLast @click="toPage(pageTotalAmount - 1)">
        <ChevronsRightIcon />
      </PaginationLast>
    </PaginationContent>
  </Pagination>
</template>
