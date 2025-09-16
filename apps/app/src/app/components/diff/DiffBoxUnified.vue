<script setup lang="ts">
import type { DiffedLine } from "./index.ts";

defineProps<{
  diffedLines: DiffedLine[];
}>();
</script>

<template>
  <div class="text-highlight-content font-mono py-2 bg-highlight-darker w-full">
    <div
      v-for="line in diffedLines"
      :key="line.newLineNumber + line.content + line.oldLineNumber"
      class="text-sm flex whitespace-pre-wrap items-start"
      :class="{
        'bg-success text-success-content': line.type === 'added',
        'bg-error text-error-content': line.type === 'removed',
      }"
    >
      <span
        class="font-semibold my-auto pr-2 text-right max-w-12 min-w-12 w-12 inline-block select-none"
      >
        {{ line.newLineNumber }}
      </span>
      <span
        class="font-semibold my-auto text-left max-w-4 min-w-4 w-4 inline-block select-none"
      >
        <!-- eslint-disable-next-line @intlify/vue-i18n/no-raw-text -->
        {{ line.type === "added" ? "+" : line.type === "removed" ? "-" : "" }}
      </span>
      <code>
        {{ line.content }}
      </code>
    </div>
  </div>
</template>
