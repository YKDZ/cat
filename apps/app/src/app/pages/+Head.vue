<script setup lang="ts">
import logoUrl from "@/app/assets/logo.png";
import "@/app/assets/style.css";
import "vue-sonner/style.css";
import { h } from "vue";

const importMapEl = h("script", {
  type: "importmap",
  innerHTML: JSON.stringify({
    imports: {
      vue: "https://cdn.jsdelivr.net/npm/vue@3.5.26/dist/vue.runtime.esm-browser.prod.js",
    },
  }),
});
</script>

<template>
  <link rel="icon" :href="logoUrl" />
  <link rel="apple-touch-icon" :href="logoUrl" />
  <component :is="importMapEl" />
</template>
