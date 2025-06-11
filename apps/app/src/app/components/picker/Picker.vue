<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { vOnClickOutside } from "@vueuse/components";
import type { PickerOption } from ".";

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
  (val) => {
    const selected = props.options.find((o) => (o.value ?? o.content) === val);
    if (selected) searchQuery.value = selected.content;
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
    <!-- 输入框 -->
    <input
      v-model="searchQuery"
      class="px-2 py-1 ring-1 ring-highlight-darkest ring-offset-transparent focus:outline-0 focus-visible:ring-base"
      :class="{
        'min-w-32 w-fit': !fullWidth,
        'w-full': fullWidth,
      }"
      :placeholder
      @focus="handleFocus"
      @keydown.esc="isOpen = false"
    />

    <!-- 下拉面板 -->
    <div
      v-show="isOpen"
      class="mt-1 rounded-md bg-white max-h-60 w-full shadow-lg absolute z-50 overflow-auto"
    >
      <div
        v-for="option in filteredOptions"
        :key="option.content"
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
          class="text-primary-500 i-mdi:check ml-2"
        />
      </div>

      <div v-if="options.length === 0" class="text-highlight-content px-3 py-2">
        无可用选项
      </div>
      <div
        v-else-if="filteredOptions.length === 0"
        class="text-highlight-content px-3 py-2"
      >
        无匹配结果
      </div>
    </div>
  </div>
</template>
