<script setup lang="ts">
import { ref } from "vue";
import type { MermaidConfig } from "mermaid";
import mermaid from "mermaid";
import zenuml from "@zenuml/core";
import { useData } from "vitepress";
import { useMutationObserver } from "@vueuse/core";

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

const svg = ref("");
const code = ref(decodeURIComponent(props.graph));
const showModal = ref(false);
const { isDark } = useData();
const init = mermaid.registerExternalDiagrams([zenuml]);
// This is a hack to force v-html to re-render, otherwise the diagram disappears
// when **switching themes** or **reloading the page**.
// The cause is that the diagram is deleted during rendering (out of Vue's knowledge).
// Because svgCode does NOT change, v-html does not re-render.
// This is not required for all diagrams, but it is required for c4c, mindmap and zenuml.
const renderKey = ref(0);

mermaid.registerIconPacks([
  {
    name: "logos",
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
  const mermaidConfig = {
    securityLevel: "loose",
    startOnLoad: false,
    theme: isDark.value ? "dark" : "default",
  } satisfies MermaidConfig;
  let svgCode = await render(props.id, code.value, mermaidConfig);
  svg.value = svgCode;
  renderKey.value += 1;
};

useMutationObserver(document.documentElement, renderChart, {
  attributes: true,
});
</script>

<template>
  <div
    :key="`${id}-${renderKey}`"
    class="cursor-pointer transition-opacity hover:opacity-80"
    @click="openModal"
    v-html="svg"
  />

  <div
    v-if="showModal"
    class="fixed inset-0 w-full h-full bg-default-1/80 flex justify-center items-center z-40 p-5 box-border overflow-auto"
    @click="closeModal"
  >
    <div
      class="relative rounded-lg bg-bg shadow-md p-5 overflow-auto w-9/10 h-9/10 md:m-2.5 md:p-4"
      @click.stop
    >
      <div
        :key="`${id}-${renderKey}`"
        class="w-full h-full overflow-auto flex items-start justify-center"
        v-html="svg"
      />
    </div>
  </div>
</template>
