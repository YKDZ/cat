<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import type { ClipperVerifyResult } from "./tagger/index.ts";
import { clippers } from "./tagger/index.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuContent,
} from "@/app/components/ui/dropdown-menu";
import { computedAsync } from "@vueuse/core";

const { sourceParts, translationParts } = storeToRefs(useEditorTableStore());

const isProcessing = ref(false);
const isOpen = ref(false);

const clipperVerifyResults = computedAsync(async () => {
  isProcessing.value = false;

  const result: ClipperVerifyResult[] = [];

  await Promise.all(
    clippers.value.map(async (clipper) => {
      if (clipper.verifyHandlers.length === 0) return;
      await Promise.all(
        clipper.verifyHandlers.map(async ({ handler }) => {
          result.push(
            await handler(clipper, sourceParts.value, translationParts.value),
          );
        }),
      );
    }),
  );

  return result;
}, []);

const isAllPass = computed(
  () => !clipperVerifyResults.value.find((result) => !result.isPass),
);

const failedResults = computed(() => {
  return clipperVerifyResults.value.filter((result) => !result.isPass);
});

watch(isAllPass, (to) => {
  isOpen.value = !to;
});
</script>

<template>
  <DropdownMenu
    :modal="false"
    :default-open="!isAllPass"
    v-model:open="isOpen"
    @open-auto-focus="(event: Event) => event.preventDefault()"
  >
    <DropdownMenuTrigger>
      <Button v-if="!isAllPass" size="icon" variant="ghost"
        ><div class="icon-[mdi--close] text-errorsize-4"
      /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuItem v-for="(result, index) in failedResults" :key="index">{{
        result.error
      }}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
