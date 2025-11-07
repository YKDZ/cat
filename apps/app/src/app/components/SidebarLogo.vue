<script setup lang="ts">
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import logoURL from "@/app/assets/logo.png";
import { useSidebar } from "@/app/components/ui/sidebar";

const ctx = usePageContext();
const { state } = useSidebar();
</script>

<template>
  <div
    class="px-2 py-1 cursor-pointer text-center rounded-sm inline-flex gap-3 h-full w-full select-none items-center"
    @click="navigate(`/`)"
  >
    <img
      :src="logoURL"
      alt="Logo"
      :class="{
        'w-6 h-6': state === 'expanded',
        'w-4 h-4': state === 'collapsed',
      }"
      class="aspect-square transition-all ease-linear"
    />
    <span v-if="state === 'expanded'" class="font-bold">{{
      ctx.globalContext.name
    }}</span>
  </div>
</template>
