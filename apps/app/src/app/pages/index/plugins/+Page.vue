<script setup lang="ts">
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.ts";
import PluginList from "@/app/components/PluginList.vue";
import { usePageContext } from "vike-vue/usePageContext";

const { plugins } = useData<Data>();

const ctx = usePageContext();
</script>

<template>
  <PluginList
    v-if="ctx.user"
    :plugins
    scope-type="USER"
    :scope-id="ctx.user.id"
    path-prefix="/plugin"
  />
</template>
