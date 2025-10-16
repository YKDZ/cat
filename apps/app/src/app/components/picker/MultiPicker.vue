<script setup lang="ts">
import { ref, computed } from "vue";
import { vOnClickOutside } from "@vueuse/components";
import { useI18n } from "vue-i18n";
import type { PickerOption } from "./index.ts";

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    options: PickerOption[];
    placeholder?: string;
    fullWidth?: boolean;
    filter?: (option: PickerOption) => boolean;
  }>(),
  {
    fullWidth: false,
    placeholder: "",
    filter: () => true,
  },
);

const modelValue = defineModel<unknown[]>({ default: [] });
const searchQuery = ref("");
const isOpen = ref(false);

const filteredOptions = computed(() => {
  if (!searchQuery.value) return props.options.filter(props.filter);
  const query = searchQuery.value.toLowerCase();
  return props.options
    .filter(props.filter)
    .filter((option) => option.content.toLowerCase().includes(query));
});

const selectOption = (option: PickerOption) => {
  const value = option.value ?? option.content;
  const index = modelValue.value.findIndex((selected) => selected === value);

  if (index !== -1) {
    modelValue.value.splice(index, 1);
  } else {
    modelValue.value.push(value);
  }

  searchQuery.value = "";
};

const removeOption = (option: PickerOption) => {
  const value = option.value ?? option.content;
  const index = modelValue.value.findIndex((selected) => selected === value);

  if (index !== -1) {
    modelValue.value.splice(index, 1);
  }
};

const close = () => (isOpen.value = false);

const handleInputFocus = () => {
  isOpen.value = true;
  if (searchQuery.value !== "") searchQuery.value = "";
};

const selectedOptions = computed(() => {
  return filteredOptions.value
    .filter((option) => modelValue.value.includes(option.value))
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
      'md:max-w-2/3': !fullWidth,
      'w-full': fullWidth,
    }"
  >
    <!-- 已选项框 -->
    <div
      class="px-2 py-1 flex gap-1 w-full ring-1 ring-offset-transparent"
      :class="{
        'ring-base': isOpen,
        'ring-highlight-darkest': !isOpen,
      }"
    >
      <div
        v-if="selectedOptions.length !== 0"
        class="inline-flex gap-1 items-center"
      >
        <div
          v-for="option in selectedOptions"
          :key="option.content"
          class="text-sm text-highlight-content-darker px-1.5 py-1 rounded-md inline-flex gap-0.5 text-nowrap shadow-sm items-center"
        >
          {{ option.content }}
          <button
            type="button"
            class="icon-[mdi--close] inline-block cursor-pointer"
            @mouseup="removeOption(option)"
          />
        </div>
      </div>
      <!-- 输入框 -->
      <input
        v-model="searchQuery"
        class="outline-0 w-full"
        :placeholder="modelValue.length === 0 ? placeholder : ``"
        @focus="handleInputFocus"
        @keydown.esc="isOpen = false"
      />
    </div>

    <!-- 下拉面板 -->
    <div
      v-show="isOpen"
      class="mt-1 rounded-md text-highlight-content bg-highlight max-h-60 w-full shadow-lg absolute z-50 overflow-auto"
    >
      <div
        v-for="option in filteredOptions"
        :key="option.content"
        type="button"
        class="px-3 py-2 flex cursor-pointer items-center hover:bg-highlight-darker"
        @click="selectOption(option)"
      >
        <span
          v-if="option.icon"
          :class="option.icon"
          class="mr-2 h-4 w-4 inline-block"
        />
        <span class="flex-1 truncate text-highlight-content-darker">{{
          option.content
        }}</span>
        <span
          v-if="modelValue.includes(option.value ?? option.content)"
          class="text-success icon-[mdi--check] ml-2"
        />
      </div>

      <div v-if="options.length === 0" class="text-highlight-content px-3 py-2">
        {{ t("无可用选项") }}
      </div>
      <div
        v-else-if="filteredOptions.length === 0"
        class="text-highlight-content px-3 py-2"
      >
        {{ t("无匹配结果") }}
      </div>
    </div>
  </div>
</template>
