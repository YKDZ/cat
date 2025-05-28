<script setup lang="ts">
import { useMagicKeys, whenever } from "@vueuse/core";
import { computed, watch } from "vue";
import Key from "./Key.vue";

const props = defineProps<{
  keyString: string;
}>();

const emits = defineEmits(["press"]);

const keys = useMagicKeys();
const requiredKeys = computed(() => props.keyString.split("+").map((k) => k.trim().toLowerCase()));

watch(() => keys.current, (to) => console.log(to))

whenever(
  () => requiredKeys.value.every((key) => keys.current.has(key)),
  () => {
    emits("press");
  },
);
</script>

<template>
  <div class="m-y-auto p-0.5 inline-flex gap-1 items-center">
    <Key v-for="key in requiredKeys" :key :key-string="key" />
  </div>
</template>
