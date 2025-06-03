<script setup lang="ts">
import type { NavbarItemType } from ".";
import NavbarItem from "./NavbarItem.vue";

const props = defineProps<{
  pathPrefix: string;
}>();

const items = defineModel<NavbarItemType[]>({ default: [] });

const handleSelect = (id: string, from: boolean, to: boolean) => {
  const index = items.value.findIndex((item) => item.to === id);
  if (index === -1) return;

  const newItem = items.value[index];
  newItem.selected = to;
  items.value.splice(index, 1, newItem);
};
</script>

<template>
  <nav>
    <ol class="flex items-center">
      <NavbarItem
        v-for="item in items"
        :key="item.to"
        :text="item.text"
        :to="item.to"
        :path-prefix
        :icon="item.icon"
        :items
        @select="(from, to) => handleSelect(item.to, from, to)"
      />
    </ol>
  </nav>
</template>
