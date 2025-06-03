<script setup lang="ts">
import GlossaryList from "@/app/components/GlossaryList.vue";
import { useGlossaryStore } from "@/app/stores/glossary";
import { storeToRefs } from "pinia";

const { glossaries } = storeToRefs(useGlossaryStore());
</script>

<template>
  <GlossaryList v-model="glossaries" />
</template>
