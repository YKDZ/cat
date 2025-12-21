<script setup lang="ts">
import { createSSRApp, h, onMounted, ref } from "vue";
import { renderToString } from "vue/server-renderer";

const props = defineProps<{
  id: string;
}>();

const app = createSSRApp({
  name: "App",
  setup() {
    const count = ref(0);
    return () =>
      h("button", { onClick: () => (count.value += 1) }, String(count.value));
  },
});

const html = await renderToString(app);

onMounted(() => {
  app.mount(`#${props.id}`);
});
</script>

<template>
  <div :id v-html="html"></div>
</template>
