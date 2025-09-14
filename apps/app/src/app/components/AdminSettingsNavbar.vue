<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import Navbar from "./navbar/Navbar.vue";
import type { NavbarItemType } from "./navbar/index.ts";

const { t } = useI18n();

const items = ref<NavbarItemType[]>([
  {
    icon: "i-mdi:server",
    text: t("基本"),
    selected: false,
    to: "",
  },
]);
</script>

<template>
  <Navbar v-model="items" path-prefix="/admin/settings" />
</template>
