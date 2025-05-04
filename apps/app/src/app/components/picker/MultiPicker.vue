<script setup lang="ts">
import { ref, computed } from "vue";
import { vOnClickOutside } from "@vueuse/components";
import { PickerOption } from ".";

const props = defineProps<{
  options: PickerOption[];
  placeholder?: string;
  fullWidth?: boolean;
}>();

const modelValue = defineModel<string[]>("modelValue", { default: [] });
const searchQuery = ref("");
const isOpen = ref(false);

const emits = defineEmits<{
  (e: "change", from: string[] | undefined, to: string[] | undefined): void;
}>();

const filteredOptions = computed(() => {
  if (!searchQuery.value) return props.options;
  const query = searchQuery.value.toLowerCase();
  return props.options.filter(
    (option) =>
      option.content.toLowerCase().includes(query) ||
      (option.value?.toLowerCase().includes(query) ?? false),
  );
});

const selectOption = (option: PickerOption) => {
  const value = option.value ?? option.content;
  const oldArr = [...modelValue.value];
  const index = modelValue.value.findIndex((selected) => selected === value);

  if (index !== -1) {
    modelValue.value.splice(index, 1);
  } else {
    modelValue.value.push(value);
  }

  searchQuery.value = "";
  emits("change", oldArr, modelValue.value);
};

const close = () => (isOpen.value = false);

const handleInputFocus = () => {
  isOpen.value = true;
  if (searchQuery.value !== "") searchQuery.value = "";
};

const selectedOptions = computed(() => {
  return props.options
    .filter((option) =>
      modelValue.value.includes(option.value ?? option.content),
    )
    .sort((a, b) => {
      const aIndex = modelValue.value.findIndex(
        (value) => (a.value ?? a.content) === value,
      );
      const bIndex = modelValue.value.findIndex(
        (value) => (b.value ?? b.content) === value,
      );
      return aIndex - bIndex;
    });
});
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
    <!-- 已选项框 -->
    <div class="px-3 py-2 flex gap-1 w-full ring-1">
      <div
        v-if="selectedOptions.length !== 0"
        class="inline-flex gap-1 items-center"
      >
        <span
          v-for="option in selectedOptions"
          :key="option.value ?? option.content"
          class="text-sm px-1.5 py-1 rounded-md text-nowrap shadow-sm"
        >
          {{ option.content }}
        </span>
      </div>
      <!-- 输入框 -->
      <input
        v-model="searchQuery"
        class="w-full focus:outline-0"
        :placeholder="modelValue.length === 0 ? placeholder : ``"
        @focus="handleInputFocus"
        @keydown.esc="isOpen = false"
      />
    </div>

    <!-- 下拉面板 -->
    <div
      v-show="isOpen"
      class="mt-1 rounded-md bg-white max-h-60 w-full shadow-lg absolute z-50 overflow-auto"
    >
      <div
        v-for="option in filteredOptions"
        :key="option.value ?? option.content"
        class="px-3 py-2 flex cursor-pointer items-center hover:bg-gray-100"
        @click="selectOption(option)"
      >
        <span
          v-if="option.icon"
          :class="option.icon"
          class="mr-2 h-4 w-4 inline-block"
        />
        <span class="flex-1 truncate">{{ option.content }}</span>
        <span
          v-if="modelValue.includes(option.value ?? option.content)"
          class="text-primary-500 i-mdi:check ml-2"
        />
      </div>

      <div v-if="options.length === 0" class="text-gray-500 px-3 py-2">
        无可用选项
      </div>
      <div
        v-else-if="filteredOptions.length === 0"
        class="text-gray-500 px-3 py-2"
      >
        无匹配结果
      </div>
    </div>
  </div>
</template>
