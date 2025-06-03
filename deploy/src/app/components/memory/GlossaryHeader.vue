<script setup lang="ts">
import Header from "@/app/components/Header.vue";
import Button from "@/app/components/Button.vue";
import { storeToRefs } from "pinia";
import { useSidebarStore } from "@/app/stores/sidebar";
import GlossaryBreadcrumb from "./GlossaryBreadcrumb.vue";
import { glossaryKey } from "@/app/utils/provide";
import { inject } from "vue";

const { isFolding } = storeToRefs(useSidebarStore());

const glossary = inject(glossaryKey);
</script>

<template>
  <Header>
    <Button
      transparent
      no-text
      icon="i-mdi:menu"
      class="font-bold md:hidden"
      @click.stop="isFolding = !isFolding"
    />
    <GlossaryBreadcrumb v-if="glossary" :glossary />
  </Header>
</template>
