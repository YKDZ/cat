<script setup lang="ts">
import { useMagicKeys } from "@vueuse/core";
import { computed, ref } from "vue";

const props = defineProps<{
  keyString: string;
}>();

const keys = useMagicKeys();

const icons = ref([
  {
    key: "enter",
    icon: "i-fluent:arrow-enter-left-24-regular",
  },
  {
    key: "control",
    icon: "i-fluent:control-button-24-regular",
  },
  {
    key: "shift",
    icon: "i-fluent:keyboard-shift-24-regular",
  },
  {
    key: "t",
    icon: "icon-[mdi--alpha-t]",
  },
  {
    key: "z",
    icon: "icon-[mdi--alpha-z]",
  },
]);

const icon = computed(
  () =>
    icons.value.find(
      (icon) => icon.key === props.keyString.trim().toLowerCase(),
    )?.icon,
);

const key = computed(() => {
  const key = keys[props.keyString];
  if (!key) throw new Error(`Invalid key: ${props.keyString}`);
  return key;
});
</script>

<template>
  <div
    :class="{
      'bg-background shadow-sm': !key.value,
      'bg-background shadow-lg scale-90': key.value,
    }"
    class="p-0.2 rounded-xs bg-op-60 inline-flex h-4 w-4 aspect-square items-center justify-center"
  >
    <span :class="icon" class="color-foreground h-full w-full" />
  </div>
</template>
