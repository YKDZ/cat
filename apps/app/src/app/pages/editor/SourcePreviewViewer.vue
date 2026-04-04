<script setup lang="ts">
import { ScrollArea, ScrollBar } from "@cat/ui";
import { Hash } from "@lucide/vue";
import { codeToHtml } from "shiki";
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import {
  detectFileType,
  detectLanguage,
} from "@/app/components/blob-view/types";

const props = defineProps<{
  content: string;
  fileName: string;
  highlightStartLine?: number | null;
  highlightEndLine?: number | null;
}>();

const { t } = useI18n();

/** Number of context lines to show around the highlighted range */
const CONTEXT_LINES = 15;

const allLines = computed(() => props.content.split("\n"));
const totalLineCount = computed(() => allLines.value.length);

const windowStart = computed(() => {
  if (
    props.highlightStartLine === undefined ||
    props.highlightStartLine === null
  )
    return 1;
  return Math.max(1, props.highlightStartLine - CONTEXT_LINES);
});

const windowEnd = computed(() => {
  if (props.highlightEndLine === undefined || props.highlightEndLine === null)
    return Math.min(totalLineCount.value, CONTEXT_LINES * 2);
  return Math.min(totalLineCount.value, props.highlightEndLine + CONTEXT_LINES);
});

const windowContent = computed(() =>
  allLines.value.slice(windowStart.value - 1, windowEnd.value).join("\n"),
);

const hasLinesBefore = computed(() => windowStart.value > 1);
const hasLinesAfter = computed(() => windowEnd.value < totalLineCount.value);

const fileInfo = computed(() => detectFileType(props.fileName));
const detectedLanguage = computed(() =>
  detectLanguage(props.fileName, fileInfo.value.extension),
);

const highlightedHtml = ref("");
const containerRef = ref<HTMLElement | null>(null);
const showLineNumbers = ref(true);
const scrollAreaClass = computed(() =>
  hasLinesBefore.value || hasLinesAfter.value ? "h-[16.5rem]" : "h-[17rem]",
);

const highlightCode = async () => {
  try {
    const startOffset = windowStart.value;
    const html = await codeToHtml(windowContent.value, {
      lang: detectedLanguage.value,
      theme: "github-light",
      transformers: [
        {
          line(node, line) {
            const absoluteLine = line + startOffset;
            this.addClassToHast(node, "line");
            node.properties["data-line"] = absoluteLine;
          },
        },
      ],
    });
    highlightedHtml.value = addLineNumbers(html, startOffset);
  } catch {
    highlightedHtml.value = "";
  }
};

const addLineNumbers = (html: string, startOffset: number): string => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const codeElement = doc.querySelector("code");
  if (!codeElement) return html;

  const lines = Array.from(codeElement.querySelectorAll(".line"));

  lines.forEach((line, index) => {
    const lineNumber = startOffset + index;
    const lineWithNumber = doc.createElement("div");
    const shouldHighlight =
      props.highlightStartLine !== undefined &&
      props.highlightStartLine !== null &&
      props.highlightEndLine !== undefined &&
      props.highlightEndLine !== null &&
      lineNumber >= props.highlightStartLine &&
      lineNumber <= props.highlightEndLine;

    lineWithNumber.className = shouldHighlight
      ? "spv-line spv-line-highlight"
      : "spv-line";

    const numberSpan = doc.createElement("span");
    numberSpan.className = "spv-line-number";
    numberSpan.textContent = lineNumber.toString();

    const lineContent = line.cloneNode(true) as Element;
    lineContent.classList.remove("line");
    lineContent.classList.add("spv-line-content");

    lineWithNumber.appendChild(numberSpan);
    lineWithNumber.appendChild(lineContent);
    line.parentNode?.replaceChild(lineWithNumber, line);
  });

  return codeElement.innerHTML;
};

watch(
  () => [windowContent.value, props.highlightStartLine, props.highlightEndLine],
  () => {
    highlightCode();
  },
  { immediate: true },
);

// Auto-scroll to highlighted line within the container
watch(highlightedHtml, async () => {
  await nextTick();
  containerRef.value
    ?.querySelector(".spv-line-highlight")
    ?.scrollIntoView({ behavior: "smooth", block: "center" });
});
</script>

<template>
  <div
    ref="containerRef"
    class="group relative text-xs leading-[1.4]"
    :class="{ 'spv-hide-line-numbers': !showLineNumbers }"
  >
    <button
      @click="showLineNumbers = !showLineNumbers"
      :title="showLineNumbers ? t('隐藏行号') : t('显示行号')"
      class="absolute top-1 right-1 z-20 rounded p-0.5 text-muted-foreground/60 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground"
    >
      <Hash :size="12" />
    </button>

    <div
      v-if="hasLinesBefore"
      class="border-b bg-muted px-3 py-1 text-center text-[11px] text-muted-foreground"
    >
      {{ t("上方省略 {n} 行", { n: windowStart - 1 }) }}
    </div>

    <div v-if="highlightedHtml" :class="scrollAreaClass">
      <ScrollArea class="h-full w-full">
        <div class="min-w-max py-1 font-mono" v-html="highlightedHtml"></div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
    <div v-else-if="windowContent" :class="scrollAreaClass">
      <ScrollArea class="h-full w-full">
        <pre
          class="min-w-max p-2 font-mono text-xs leading-[1.4] whitespace-pre"
          >{{ windowContent }}</pre
        >
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>

    <div
      v-if="hasLinesAfter"
      class="border-t bg-muted px-3 py-1 text-center text-[11px] text-muted-foreground"
    >
      {{ t("下方省略 {n} 行", { n: totalLineCount - windowEnd }) }}
    </div>
  </div>
</template>

<style scoped>
@reference "tailwindcss";

:deep(.spv-line) {
  @apply flex min-h-[1.3rem] w-full;
}

:deep(.spv-line-number) {
  @apply sticky left-0 mr-2 inline-flex min-w-9 shrink-0 items-center justify-end pr-2 text-[10px] leading-[1.3rem] select-none;
  color: rgba(120, 120, 120, 0.5);
  border-right: 1px solid
    color-mix(in srgb, var(--muted-foreground) 15%, transparent);
  background-color: var(--background);
}

:deep(.spv-line-content) {
  @apply min-w-0 flex-1 whitespace-pre;
}

:deep(.spv-line-highlight) {
  background-color: color-mix(in srgb, var(--primary) 14%, transparent);
}

:deep(.spv-line-highlight .spv-line-number) {
  background-color: color-mix(in srgb, var(--primary) 14%, var(--background));
  color: var(--primary);
}

.spv-hide-line-numbers :deep(.spv-line-number) {
  @apply hidden;
}
</style>
