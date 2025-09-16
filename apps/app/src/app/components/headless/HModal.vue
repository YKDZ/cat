<script setup lang="ts">
import { vOnClickOutside } from "@vueuse/components";
import { useMagicKeys } from "@vueuse/core";
import { computed, watch } from "vue";

type Classes = {
  modal?: string;
  "modal-backdrop"?: string;
};

const props = defineProps<{
  classes?: Classes;
}>();

const isOpen = defineModel<boolean>({ default: false });

const state = computed(() => ({
  isOpen,
}));

const modalClasses = computed(() => ({
  modal: props.classes?.["modal"] ?? "",
  "modal-backdrop": props.classes?.["modal-backdrop"] ?? "",
}));

const handleClickOutside = () => {
  isOpen.value = false;
};

const { escape } = useMagicKeys();

watch(escape, () => (isOpen.value = false));
</script>

<template>
  <Teleport to="#teleported">
    <div v-if="isOpen" :class="modalClasses['modal-backdrop']">
      <div
        v-on-click-outside="handleClickOutside"
        :class="[modalClasses.modal]"
        aria-modal="true"
      >
        <slot />
      </div></div
  ></Teleport>
  <slot name="custom" :state :classes />
</template>
