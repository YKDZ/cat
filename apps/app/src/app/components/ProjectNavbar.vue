<script setup lang="ts">
import { ref, watchEffect } from "vue";
import ProjectNavbarItem from "./ProjectNavbarItem.vue";

const items = ref([
  {
    text: "主页",
    to: "",
    selected: false,
    fallback: true,
  },
  {
    text: "文档",
    to: "/documents",
    selected: false,
    fallback: false,
  },
  {
    text: "记忆",
    to: "/memories",
    selected: false,
    fallback: false,
  },
  {
    text: "术语",
    to: "/glossaries",
    selected: false,
    fallback: false,
  },
  {
    text: "成员",
    to: "/members",
    selected: false,
    fallback: false,
  },
  {
    text: "设置",
    to: "/settings",
    selected: false,
    fallback: false,
  },
]);

const fallbackTrigger = ref(false);

const handleSelect = (id: string, from: boolean, to: boolean) => {
  const index = items.value.findIndex((item) => item.to === id);
  if (index === -1) return;

  const newItem = items.value[index];
  newItem.selected = to;
  items.value.splice(index, 1, newItem);
};

watchEffect(() => {
  const index = items.value.findIndex((item) => item.selected === true);
  fallbackTrigger.value = index === -1;
});
</script>

<template>
  <nav>
    <ol class="flex items-center">
      <ProjectNavbarItem
        v-for="item in items"
        :key="item.to"
        v-model:fallback-trigger="fallbackTrigger"
        :text="item.text"
        :to="item.to"
        :fallback="item.fallback"
        @select="(from, to) => handleSelect(item.to, from, to)"
      />
    </ol>
  </nav>
</template>
