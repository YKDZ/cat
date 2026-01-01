<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import type { ClipperVerifyResult } from "@/app/components/tagger/index.ts";
import { clippers } from "@/app/components/tagger/index.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { Button } from "@/app/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";
import { computedAsync } from "@vueuse/core";
import { CircleQuestionMark } from "lucide-vue-next";

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
  <Popover :modal="false" v-model:open="isOpen">
    <PopoverTrigger>
      <Button v-if="!isAllPass" size="icon" variant="ghost"
        ><CircleQuestionMark class="text-yellow-500" />
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-auto">
      <div class="flex flex-col gap-1 text-sm text-nowrap">
        <p v-for="(result, index) in failedResults" :key="index">
          {{ result.error }}
        </p>
      </div>
    </PopoverContent>
  </Popover>
</template>
