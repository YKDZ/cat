<script setup lang="ts">
import { ref } from "vue";
import Navbar from "./navbar/Navbar.vue";
import type { NavbarItemType } from "./navbar";

const items = ref<NavbarItemType[]>([
  {
    icon: "i-mdi:server",
    text: "基本",
    selected: false,
    to: "",
  },
  {
    icon: "i-mdi:storage-tank",
    text: "储存",
    selected: false,
    to: "/storage",
  },
]);
</script>

<template>
  <Navbar v-model="items" path-prefix="/admin/settings" />
</template>
