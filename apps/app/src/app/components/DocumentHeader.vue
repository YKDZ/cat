<script setup lang="ts">
import DocumentBreadcrumb from "./DocumentBreadcrumb.vue";
import Header from "./Header.vue";
import { inject, ref } from "vue";
import HButton from "./headless/HButton.vue";
import { documentKey } from "@/app/utils/provide.ts";

const isFolding = ref(false);

const document = inject(documentKey)!;
</script>

<template>
  <Header>
    <HButton
      :classes="{
        base: 'btn btn-transparent btn-md btn-square',
      }"
      icon="i-mdi:menu"
      class="md:hidden"
      @click="isFolding = !isFolding"
    />
    <DocumentBreadcrumb :document />
  </Header>
</template>
