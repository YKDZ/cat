<script setup lang="ts">
import { useSidebar } from "@cat/ui";
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";

import logoURL from "@/app/assets/logo.png";

const props = defineProps<{
  sidebarId: string;
}>();

const ctx = usePageContext();
const { state } = useSidebar(props.sidebarId);
</script>

<template>
  <div
    class="inline-flex h-full w-full cursor-pointer items-center gap-3 rounded-sm px-2 py-1 text-center select-none"
    @click="navigate(`/`)"
  >
    <img
      :src="logoURL"
      alt="Logo"
      :class="{
        'h-6 w-6': state === 'expanded',
        'h-4 w-4': state === 'collapsed',
      }"
      class="aspect-square transition-all ease-linear"
    />
    <span v-if="state === 'expanded'" class="font-bold">{{
      ctx.globalContext.name
    }}</span>
  </div>
</template>
