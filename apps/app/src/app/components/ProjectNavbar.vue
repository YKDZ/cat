<script setup lang="ts">
import { ref } from "vue";
import { usePageContext } from "vike-vue/usePageContext";
import { useI18n } from "vue-i18n";
import Navbar from "./navbar/Navbar.vue";
import type { NavbarItemType } from "./navbar/index.ts";

const ctx = usePageContext();
const { t } = useI18n();

const items = ref<NavbarItemType[]>([
  {
    text: t("主页"),
    to: "",
    selected: false,
    icon: "i-mdi:earth",
  },
  {
    text: t("文档"),
    to: "/documents",
    selected: false,
    icon: "i-mdi:document",
  },
  {
    text: t("记忆"),
    to: "/memories",
    selected: false,
    icon: "i-mdi:zip-box",
  },
  {
    text: t("术语"),
    to: "/glossaries",
    selected: false,
    icon: "i-mdi:file-word-box",
  },
  {
    text: t("成员"),
    to: "/members",
    selected: false,
    icon: "i-mdi:account-group",
  },
  {
    text: t("任务"),
    to: "/tasks",
    selected: false,
    icon: "i-mdi:account-hard-hat",
  },
  {
    text: t("设置"),
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
