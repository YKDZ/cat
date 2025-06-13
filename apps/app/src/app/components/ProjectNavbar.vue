<script setup lang="ts">
import { ref } from "vue";
import Navbar from "./navbar/Navbar.vue";
import { usePageContext } from "vike-vue/usePageContext";
import type { NavbarItemType } from "./navbar";

const ctx = usePageContext();

const items = ref<NavbarItemType[]>([
  {
    text: "主页",
    to: "",
    selected: false,
    icon: "i-mdi:earth",
  },
  {
    text: "文档",
    to: "/documents",
    selected: false,
    icon: "i-mdi:document",
  },
  {
    text: "记忆",
    to: "/memories",
    selected: false,
    icon: "i-mdi:zip-box",
  },
  {
    text: "术语",
    to: "/glossaries",
    selected: false,
    icon: "i-mdi:file-word-box",
  },
  {
    text: "成员",
    to: "/members",
    selected: false,
    icon: "i-mdi:account-group",
  },
  {
    text: "任务",
    to: "/tasks",
    selected: false,
    icon: "i-mdi:account-hard-hat",
  },
  {
    text: "设置",
    to: "/settings",
    selected: false,
    icon: "i-mdi:cog",
  },
]);
</script>

<template>
  <Navbar
    v-model="items"
    :path-prefix="`/project/${ctx.routeParams.projectId}`"
  />
</template>
