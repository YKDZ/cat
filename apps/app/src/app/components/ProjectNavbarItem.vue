<script setup lang="ts">
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { computed, watch } from "vue";

const ctx = usePageContext();

const props = defineProps({
  text: {
    type: String,
    default: "",
  },
  to: {
    type: String,
    default: "",
  },
  fallback: {
    type: Boolean,
    required: false,
    default: false,
  },
});

const fallbackTrigger = defineModel<boolean>("fallbackTrigger", {
  required: true,
});

const emits = defineEmits<{
  (e: "select", from: boolean, to: boolean): void;
}>();

const handleNav = () => {
  navigate(url.value);
};

const url = computed(() => {
  return (
    `/project/${ctx.routeParams.projectId}` + (props.to === "" ? "" : props.to)
  );
});

const selected = computed(() => {
  if (props.fallback) return false;
  return ctx.urlPathname.startsWith(url.value);
});

watch(selected, (to, from) => emits("select", from ?? false, to), {
  immediate: true,
});
</script>

<template>
  <li
    class="px-3 py-0.5 pb-1 border-b-2 cursor-pointer"
    :class="{
      'border-base': selected || (fallback && fallbackTrigger),
      'border-highlight-darker': !selected && !(fallback && fallbackTrigger),
    }"
    @click="handleNav"
  >
    {{ text }}
  </li>
</template>
