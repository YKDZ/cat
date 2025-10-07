<script setup lang="ts">
import { storeToRefs } from "pinia";
import type { Glossary } from "@cat/shared/schema/drizzle/glossary";
import type { User } from "@cat/shared/schema/drizzle/user";
import GlossaryBreadcrumb from "./GlossaryBreadcrumb.vue";
import HButton from "./headless/HButton.vue";
import Header from "@/app/components/headless/HHeader.vue";
import { useSidebarStore } from "@/app/stores/sidebar.ts";

const { isFolding } = storeToRefs(useSidebarStore());

defineProps<{
  glossary: Glossary & {
    Creator: User;
  };
}>();
</script>

<template>
  <Header
    :classes="{
      header: 'header',
    }"
  >
    <HButton
      :classes="{
        base: 'btn btn-transparent btn-square',
      }"
      icon="i-mdi:menu"
      class="font-bold md:hidden"
      @click.stop="isFolding = !isFolding"
    />
    <GlossaryBreadcrumb :glossary />
  </Header>
</template>
