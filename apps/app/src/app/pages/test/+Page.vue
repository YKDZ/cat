<script setup lang="ts">
import DiffBox from "@/app/components/diff/DiffBox.vue";
import { onMounted } from "vue";

const old = {
  app: {
    name: "测试应用",
    version: "1.0.0",
    features: ["登录", "搜索", "导出"],
    settings: {
      theme: "light",
      itemsPerPage: 10,
    },
  },
  users: [
    { id: "u1", name: "张三" },
    { id: "u2", name: "李四" },
  ],
  notes: "这是老版本的文案。",
};

const now = {
  app: {
    name: "测试应用",
    version: "1.1.0",
    features: ["登录", "搜索", "导出PDF", "分享"],
    settings: {
      theme: "dark",
      itemsPerPage: 20,
    },
  },
  users: [
    { id: "u1", name: "张三（已更新）" },
    { id: "u2", name: "李四" },
    { id: "u3", name: "王五" },
  ],
  notes: "这是新版的文案，包含若干改动与新功能说明。",
};

onMounted(() => {
  console.log("Old Data:", JSON.stringify(old, null, 2));
  console.log("New Data:", JSON.stringify(now, null, 2));
});
</script>

<template>
  <DiffBox
    :old="JSON.stringify(old, null, 2)"
    :now="JSON.stringify(now, null, 2)"
  />
</template>
