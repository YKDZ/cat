<script setup lang="ts">
import type { MermaidConfig } from "mermaid";

import { useElementHover } from "@vueuse/core";
import mermaid from "mermaid";
import { useData } from "vitepress";
import { onMounted, ref, useTemplateRef, watch } from "vue";

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
const showSource = ref(false);
const mermaidContainer = useTemplateRef<HTMLButtonElement>("mermaidContainer");
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
    loader: async () => {
      const res = await fetch(
        "https://unpkg.com/@iconify-json/logos/icons.json",
      );
      return res.json();
    },
  },
]);


const render = async (
  id: string,
  code: string,
  config: MermaidConfig,
): Promise<string> => {
  const zenuml = await import("@zenuml/core");
  const init = mermaid.registerExternalDiagrams([zenuml]);


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
  showSource.value = false;
};


const toggleSource = () => {
  showSource.value = !showSource.value;
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


watch(isDark, renderChart);


onMounted(renderChart);
</script>

<template>
  <div v-if="isRendering" class="my-4 h-64 w-full" />

  <div v-if="!isRendering" class="relative my-4" ref="mermaidContainer">
    <div
      v-if="!showSource"
      :key="`${id}-${renderKey}`"
      class="cursor-pointer transition-opacity hover:opacity-80"
      @click="openModal"
      v-html="svg"
    />
    <div v-else class="h-full w-full overflow-auto">
      <pre
        class="bg-default-soft rounded-md p-4 text-sm"
      ><code>{{ code }}</code></pre>
    </div>
    <button
      v-if="isHovered"
      class="hover:bg-default-soft absolute top-1 right-1 h-5.5 w-5.5 rounded-md p-0.5"
      @click.stop="toggleSource"
    >
      <div v-if="showSource" class="icon-[mdi--code] h-full w-full" />
      <div v-else class="icon-[mdi--chart-box-outline] h-full w-full" />
    </button>
  </div>

  <div
    v-if="showModal"
    class="bg-default-1/80 fixed inset-0 z-40 box-border flex h-full w-full items-center justify-center overflow-auto p-5"
    @click="closeModal"
  >
    <div
      class="bg-bg relative h-11/12 w-11/12 overflow-auto rounded-lg p-3 shadow-md md:m-2.5 md:p-4"
      @click.stop
    >
      <button @click="closeModal" class="absolute top-1 right-1 h-6 w-6">
        <div class="icon-[mdi--close] h-full w-full" />
      </button>
      <div
        :key="`${id}-${renderKey}`"
        class="flex h-full w-full items-start justify-center overflow-auto"
        v-html="svg"
      />
    </div>
  </div>
</template>
