<script setup lang="ts">
import { onMounted, ref, useTemplateRef, watch } from "vue";
import type { MermaidConfig } from "mermaid";
import mermaid from "mermaid";
import zenuml from "@zenuml/core";
import { useData } from "vitepress";
import { useElementHover } from "@vueuse/core";

const props = defineProps({
  id: {
    type: String,
    required: true,
  },
  graph: {
    type: String,
    required: true,
  },
});

const { isDark } = useData();

const svg = ref("");
const code = ref(decodeURIComponent(props.graph));
const showModal = ref(false);
const mermaidContainer = useTemplateRef<HTMLButtonElement>("mermaidContainer");
const init = mermaid.registerExternalDiagrams([zenuml]);
const isHovered = useElementHover(mermaidContainer);
const isRendering = ref(false);
// This is a hack to force v-html to re-render, otherwise the diagram disappears
// when **switching themes** or **reloading the page**.
// The cause is that the diagram is deleted during rendering (out of Vue's knowledge).
// Because svgCode does NOT change, v-html does not re-render.
// This is not required for all diagrams, but it is required for c4c, mindmap and zenuml.
const renderKey = ref(0);

mermaid.registerIconPacks([
  {
    name: "@iconify/logos",
    loader: () =>
      fetch("https://unpkg.com/@iconify-json/logos/icons.json").then((res) =>
        res.json(),
      ),
  },
]);

const render = async (
  id: string,
  code: string,
  config: MermaidConfig,
): Promise<string> => {
  await init;
  mermaid.initialize(config);
  const { svg } = await mermaid.render(id, code);
  return svg;
};

const openModal = () => {
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
};

const renderChart = async () => {
  isRendering.value = true;
  const mermaidConfig = {
    securityLevel: "loose",
    startOnLoad: false,
    theme: isDark.value ? "dark" : "null",
  } satisfies MermaidConfig;
  let svgCode = await render(props.id, code.value, mermaidConfig);
  svg.value = svgCode;
  renderKey.value += 1;
  isRendering.value = false;
};

const downloadSVG = (filename: string = props.id): void => {
  if (!svg.value) {
    console.error("SVG content not available");
    return;
  }

  let source = svg.value;

  if (!source.startsWith("<?xml")) {
    source = '<?xml version="1.0" standalone="no"?>\n' + source;
  }

  const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.svg`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
};

watch(isDark, renderChart);

onMounted(renderChart);
</script>

<template>
  <div v-if="isRendering" class="w-full h-64" />

  <div v-if="!isRendering" class="relative my-20px" ref="mermaidContainer">
    <div
      :key="`${id}-${renderKey}`"
      class="cursor-pointer transition-opacity hover:opacity-80"
      @click="openModal"
      v-html="svg"
    />
    <button
      v-if="isHovered"
      class="absolute right-0 top-0 hover:bg-default-soft p-0.5 w-8 h-8 rounded-md"
      @click="downloadSVG()"
    >
      <div class="icon-[mdi--download] w-full h-full" />
    </button>
  </div>

  <div
    v-if="showModal"
    class="fixed inset-0 w-full h-full bg-default-1/80 flex justify-center items-center z-40 p-5 box-border overflow-auto"
    @click="closeModal"
  >
    <div
      class="relative rounded-lg bg-bg shadow-md p-5 overflow-auto w-9/10 h-9/10 md:m-2.5 md:p-4"
      @click.stop
    >
      <button
        class="absolute right-3 top-3 hover:bg-default-soft p-0.5 w-8 h-8 rounded-md"
        @click="downloadSVG()"
      >
        <div class="icon-[mdi--download] w-full h-full" />
      </button>
      <div
        :key="`${id}-${renderKey}`"
        class="w-full h-full overflow-auto flex items-start justify-center"
        v-html="svg"
      />
    </div>
  </div>
</template>
