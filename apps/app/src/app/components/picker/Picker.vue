<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { vOnClickOutside } from "@vueuse/components";
import { useI18n } from "vue-i18n";
import type { PickerOption } from "./index.ts";

const { t } = useI18n();

const props = defineProps<{
  options: PickerOption[];
  placeholder?: string;
  fullWidth?: boolean;
}>();

const modelValue = defineModel<unknown>({ default: null });
const searchQuery = ref("");
const isOpen = ref(false);

const emits = defineEmits<{
  (e: "change", from: unknown, to: unknown): void;
}>();

const filteredOptions = computed(() => {
  if (!searchQuery.value) return props.options;
  const query = searchQuery.value.toLowerCase();
  return props.options.filter((option) =>
    option.content.toLowerCase().includes(query),
  );
});

const selectOption = (option: PickerOption) => {
  const value = option.value;

  if (value === modelValue.value) {
    modelValue.value = null;
    searchQuery.value = "";
  } else {
    modelValue.value = option.value;
    searchQuery.value = option.content;
    isOpen.value = false;
  }

  emits("change", modelValue.value, value);
};

const close = () => (isOpen.value = false);

const handleFocus = () => {
  isOpen.value = true;
};

watch(
  modelValue,
  (to) => {
    if (to) {
      const option = props.options.find((o) => o.value === to);
      if (option) {
        searchQuery.value = option.content;
      } else {
        searchQuery.value = "";
      }
    } else {
      searchQuery.value = "";
    }
  },
  { immediate: true },
);
</script>

<template>
  <div
    v-on-click-outside="close"
    class="relative"
    :class="{
      'w-fit': !fullWidth,
      'w-full': fullWidth,
    }"
  >
    <input
      v-model="searchQuery"
      class="text-highlight-content-darker px-2 py-1 outline-1 outline-highlight-darkest bg-highlight focus-visible:outline-base"
      :class="{
        'min-w-32 w-fit': !fullWidth,
        'w-full': fullWidth,
      }"
      :placeholder
      @focus="handleFocus"
      @keydown.esc="isOpen = false"
    />

    <div
      v-show="isOpen"
      class="text-highlight-content-darker mt-1 rounded-md bg-highlight bg-white max-h-60 w-full shadow-lg absolute z-50 overflow-auto"
    >
      <div
        v-for="option in filteredOptions"
        :key="JSON.stringify(option.value)"
        class="px-3 py-2 flex cursor-pointer items-center hover:bg-highlight-darker"
        @click="selectOption(option)"
      >
        <span
          v-if="option.icon"
          :class="option.icon"
          class="mr-2 h-4 w-4 inline-block"
        />
        <span class="flex-1 truncate">{{ option.content }}</span>
        <span
          v-if="(option.value ?? option.content) === modelValue"
          class="i-mdi:check text-base ml-2"
        />
      </div>

      <div
        v-if="options.length === 0"
        class="text-highlight-content-darker px-3 py-2"
      >
        {{ t("无可用选项") }}
      </div>
      <div
        v-else-if="filteredOptions.length === 0"
        class="text-highlight-content-darker px-3 py-2"
      >
        {{ t("无匹配结果") }}
      </div>
    </div>
  </div>
</template>
