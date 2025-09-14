<script setup lang="ts">
import { storeToRefs } from "pinia";
import { inject } from "vue";
import GlossaryBreadcrumb from "./GlossaryBreadcrumb.vue";
import HButton from "./headless/HButton.vue";
import Header from "@/app/components/Header.vue";
import { useSidebarStore } from "@/app/stores/sidebar.ts";
import { glossaryKey } from "@/app/utils/provide.ts";

const { isFolding } = storeToRefs(useSidebarStore());

const glossary = inject(glossaryKey);
</script>

<template>
  <Header>
    <HButton
      :classes="{
        base: 'btn btn-transparent btn-square',
      }"
      icon="i-mdi:menu"
      class="font-bold md:hidden"
      @click.stop="isFolding = !isFolding"
    />
    <GlossaryBreadcrumb v-if="glossary" :glossary />
  </Header>
</template>
