<script setup lang="ts">
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { computed, ref, watch } from "vue";
import Icon from "../Icon.vue";
import { NavbarItemType } from ".";

const ctx = usePageContext();

const props = defineProps<{
  text: string;
  pathPrefix: string;
  to: string;
  icon: string;
  items: NavbarItemType[];
}>();

const emits = defineEmits<{
  (e: "select", from: boolean, to: boolean): void;
}>();

const handleNav = () => {
  navigate(url.value);
};

const url = computed(() => {
  return props.pathPrefix + (props.to === "" ? "" : props.to);
});

const selected = computed(() => {
  if (props.to.length === 0) {
    const anyNonRootMatched = props.items.some((item) => {
      if (item.to.length === 0) return false;
      const itemUrl = props.pathPrefix + item.to;
      return ctx.urlPathname.startsWith(itemUrl);
    });
    return !anyNonRootMatched;
  } else {
    return ctx.urlPathname.startsWith(url.value);
  }
});

watch(selected, (to, from) => emits("select", from ?? false, to), {
  immediate: true,
});
</script>

<template>
  <li
    class="px-3 py-0.5 pb-1 border-b-2 flex gap-1 cursor-pointer items-center"
    :class="{
      'border-base': selected,
      'border-highlight-darker': !selected,
    }"
    @click="handleNav"
  >
    <Icon small :icon />
    <span>{{ text }}</span>
  </li>
</template>
