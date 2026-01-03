<script setup lang="ts">
import { inject } from "vue";
import DiffBox from "./DiffBox.vue";
import { useInjectionKey } from "@/app/utils/provide.ts";
import type { Data } from "./+data.server";

const document = inject(useInjectionKey<Data>()("document"));
</script>

<template>
  <DiffBox v-if="document" :document-id="document.id" />
</template>
