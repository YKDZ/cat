<script setup lang="ts">
import { computed } from "vue";
import { diffChars } from "diff";
import type { DiffedLine } from "./index.ts";

const props = defineProps<{
  diffedLines: DiffedLine[];
}>();

type DiffSegment = {
  value: string;
  type: "added" | "removed" | "unchanged";
};

type DiffedRow = {
  leftLine?: {
    lineNumber?: number;
    type: "removed" | "unchanged";
    content: string;
  };
  rightLine?: {
    lineNumber?: number;
    type: "added" | "unchanged";
    content: string;
  };
  leftChars?: DiffSegment[];
  rightChars?: DiffSegment[];
};

const normalizeContent = (s?: string) => {
  if (s === undefined) return "";
  return s === "" ? "" : s;
};

const buildCharDiffs = (left?: string, right?: string) => {
  if (left === undefined || right === undefined) return null;
  // if both strings are identical, skip expensive diff
  if (left === right) return { left: null, right: null };

  const raw = diffChars(left, right);
  const leftSegments: DiffSegment[] = [];
  const rightSegments: DiffSegment[] = [];

  for (const seg of raw) {
    const type = seg.added ? "added" : seg.removed ? "removed" : "unchanged";
    // push segment to left view (show removed and unchanged; show added too but visually marked)
    leftSegments.push({ value: seg.value, type });
    // push segment to right view
    rightSegments.push({ value: seg.value, type });
  }

  return { left: leftSegments, right: rightSegments };
};

const diffedRows = computed<DiffedRow[]>(() => {
  const rows: DiffedRow[] = [];
  const lines = props.diffedLines;
  let i = 0;
  const n = lines.length;

  const safeGet = (array: any[], index: number) => {
    return index >= 0 && index < array.length ? array[index] : undefined;
  };

  const isValidLineType = (index: number, expectedType: string) => {
    const line = safeGet(lines, index);
    return line && line.type === expectedType;
  };

  while (i < n) {
    const cur = safeGet(lines, i);

    if (!cur) break;

    if (cur.type === "unchanged") {
      rows.push({
        leftLine: {
          lineNumber: cur.oldLineNumber,
          type: "unchanged",
          content: normalizeContent(cur.content),
        },
        rightLine: {
          lineNumber: cur.newLineNumber,
          type: "unchanged",
          content: normalizeContent(cur.content),
        },
      });
      i++;
      continue;
    }

    if (cur.type === "removed") {
      const removed: DiffedLine[] = [];
      const added: DiffedLine[] = [];

      // 安全收集所有连续的removed行
      while (isValidLineType(i, "removed")) {
        const line = safeGet(lines, i);
        if (line) {
          removed.push(line);
        }
        i++;
      }

      // 安全收集所有连续的added行
      while (isValidLineType(i, "added")) {
        const line = safeGet(lines, i);
        if (line) {
          added.push(line);
        }
        i++;
      }

      const maxLen = Math.max(removed.length, added.length);
      for (let k = 0; k < maxLen; k++) {
        const removedLine = safeGet(removed, k);
        const addedLine = safeGet(added, k);

        const left = removedLine
          ? {
              lineNumber: removedLine.oldLineNumber,
              type: "removed" as const,
              content: normalizeContent(removedLine.content),
            }
          : undefined;

        const right = addedLine
          ? {
              lineNumber: addedLine.newLineNumber,
              type: "added" as const,
              content: normalizeContent(addedLine.content),
            }
          : undefined;

        const row: DiffedRow = { leftLine: left, rightLine: right };

        // compute char diffs only when there is a pair to compare
        if (left && right) {
          const cd = buildCharDiffs(left.content, right.content);
          if (cd) {
            row.leftChars = cd.left || undefined;
            row.rightChars = cd.right || undefined;
          }
        }

        rows.push(row);
      }
      continue;
    }

    if (cur.type === "added") {
      const added: DiffedLine[] = [];
      const removed: DiffedLine[] = [];

      // 安全收集所有连续的added行
      while (isValidLineType(i, "added")) {
        const line = safeGet(lines, i);
        if (line) {
          added.push(line);
        }
        i++;
      }

      // 安全收集所有连续的removed行
      while (isValidLineType(i, "removed")) {
        const line = safeGet(lines, i);
        if (line) {
          removed.push(line);
        }
        i++;
      }

      const maxLen = Math.max(added.length, removed.length);
      for (let k = 0; k < maxLen; k++) {
        const removedLine = safeGet(removed, k);
        const addedLine = safeGet(added, k);

        const left = removedLine
          ? {
              lineNumber: removedLine.oldLineNumber,
              type: "removed" as const,
              content: normalizeContent(removedLine.content),
            }
          : undefined;

        const right = addedLine
          ? {
              lineNumber: addedLine.newLineNumber,
              type: "added" as const,
              content: normalizeContent(addedLine.content),
            }
          : undefined;

        const row: DiffedRow = { leftLine: left, rightLine: right };

        if (left && right) {
          const cd = buildCharDiffs(left.content, right.content);
          if (cd) {
            row.leftChars = cd.left || undefined;
            row.rightChars = cd.right || undefined;
          }
        }

        rows.push(row);
      }
      continue;
    }

    i++;
  }

  return rows;
});
</script>

<template>
  <div class="text-highlight-content py-2 bg-highlight-darker flex w-full">
    <!-- 左列整体容器 -->
    <div
      class="flex flex-col max-w-1/2 min-w-1/2 w-1/2 items-start overflow-x-auto"
    >
      <div
        v-for="(row, index) in diffedRows"
        :key="index"
        class="text-sm font-mono flex w-full whitespace-pre"
        :class="{
          'bg-error text-error-content': row.leftLine?.type === 'removed',
        }"
      >
        <span
          class="font-semibold pr-2 text-right max-w-12 min-w-12 w-12 select-none left-0 sticky"
          :class="{
            'bg-highlight-darker': row.leftLine?.type !== 'removed',
            'bg-error': row.leftLine?.type === 'removed',
          }"
        >
          {{ row.leftLine?.lineNumber || "" }}
        </span>
        <span class="font-semibold text-left max-w-4 min-w-4 w-4">
          <!-- eslint-disable-next-line @intlify/vue-i18n/no-raw-text -->
          {{ row.leftLine?.type === "removed" ? "-" : "" }}
        </span>

        <code v-if="row.leftChars && row.leftChars.length">
          <span
            v-for="(seg, si) in row.leftChars"
            :key="si"
            class="whitespace-pre-wrap"
            :class="{
              'bg-error-darker text-error-content': seg.type === 'removed',
              'bg-success-darker text-success-content': seg.type === 'added',
            }"
          >
            <template v-if="seg.type !== 'added'"> {{ seg.value }}</template>
          </span>
        </code>
        <code v-else>
          {{ row.leftLine ? row.leftLine.content : "" }}
        </code>
      </div>
    </div>

    <!-- 右列整体容器 -->
    <div
      class="flex flex-col max-w-1/2 min-w-1/2 w-1/2 items-start overflow-x-auto"
    >
      <div
        v-for="(row, index) in diffedRows"
        :key="index"
        class="text-sm font-mono flex w-full whitespace-pre"
        :class="{
          'bg-success text-success-content': row.rightLine?.type === 'added',
        }"
      >
        <span
          class="font-semibold pr-2 text-right max-w-12 min-w-12 w-12 select-none left-0 sticky"
          :class="{
            'bg-highlight-darker': row.rightLine?.type !== 'added',
            'bg-success': row.rightLine?.type === 'added',
          }"
        >
          {{ row.rightLine?.lineNumber || "" }}
        </span>
        <span class="font-semibold text-left max-w-4 min-w-4 w-4">
          <!-- eslint-disable-next-line @intlify/vue-i18n/no-raw-text -->
          {{ row.rightLine?.type === "added" ? "+" : "" }}
        </span>

        <code v-if="row.rightChars && row.rightChars.length">
          <span
            v-for="(seg, si) in row.rightChars"
            :key="si"
            class="whitespace-pre-wrap"
            :class="{
              'bg-success-darker text-success-content': seg.type === 'added',
            }"
          >
            <template v-if="seg.type !== 'removed'"> {{ seg.value }}</template>
          </span>
        </code>
        <code v-else>
          {{ row.rightLine ? row.rightLine.content : "" }}
        </code>
      </div>
    </div>
  </div>
</template>
