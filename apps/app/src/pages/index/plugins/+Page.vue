<script setup lang="ts">
import { useData } from "vike-vue/useData";
import { usePageContext } from "vike-vue/usePageContext";

import PluginList from "@/components/PluginList.vue";

import type { Data } from "./+data.ts";

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
