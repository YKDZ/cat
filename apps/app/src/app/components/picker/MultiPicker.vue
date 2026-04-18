<script setup lang="ts" generic="T extends AcceptableInputValue">
import {
  Combobox,
  ComboboxAnchor,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
  ComboboxTrigger,
  ComboboxViewport,
  TagsInput,
  TagsInputItem,
  TagsInputItemDelete,
  Button,
} from "@cat/ui";
import { ComboboxVirtualizer, type AcceptableInputValue } from "reka-ui";
import { shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";

import type { PickerOption } from "./index.ts";

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    options: PickerOption<T>[];
    placeholder?: string;
    loadMore?: () => void;
    portal?: boolean;
  }>(),
  {
    portal: true,
  },
);

const modalValue = defineModel<T[]>({
  default: [],
});

const selectedOptions = shallowRef<PickerOption<T>[]>([]);
const search = defineModel<string>("search", { default: "" });

// Resolve modelValue entries that don't yet have a matching selectedOption.
// Watches both options (pagination / search) and modelValue (async load from server).
watch(
  [() => props.options, modalValue],
  ([opts, values]) => {
    if (values.length === 0 || opts.length === 0) return;
    const selectedSet = new Set(
      selectedOptions.value.map((o) => o.value as unknown),
    );
    const missing = opts.filter(
      (o) =>
        (values as unknown[]).includes(o.value) &&
        !selectedSet.has(o.value as unknown),
    );
    if (missing.length > 0) {
      selectedOptions.value = [...selectedOptions.value, ...missing];
    }
  },
  { immediate: true },
);

// Keep modalValue in sync when TagsInput removes a tag via the × button.
// (onSelect already handles add/remove through the combobox dropdown.)
watch(selectedOptions, (opts) => {
  const newValues = opts.map((o) => o.value);
  const curSet = new Set(modalValue.value as unknown[]);
  if (
    newValues.length !== curSet.size ||
    newValues.some((v) => !curSet.has(v as unknown))
  ) {
    modalValue.value = newValues;
  }
});

const onSelect = (option: PickerOption<T> | undefined) => {
  if (option) {
    const index = selectedOptions.value.findIndex(
      (selectedOption) => selectedOption.value === option.value,
    );
    if (index === -1) {
      selectedOptions.value.push(option);
    } else {
      selectedOptions.value.splice(index, 1);
    }
  }
  modalValue.value = selectedOptions.value.map((option) => option.value);
};

const onScroll = (e: Event) => {
  const target = e.target as HTMLElement;
  if (target.scrollTop + target.clientHeight >= target.scrollHeight - 20) {
    props.loadMore?.();
  }
};
</script>

<template>
  <Combobox :modelValue="selectedOptions" ignore-filter>
    <TagsInput v-model="selectedOptions" class="w-full min-w-96 gap-2 px-2">
      <div class="flex flex-wrap items-center gap-2">
        <TagsInputItem
          v-for="option in selectedOptions"
          :key="option.toString()"
          :value="option"
        >
          <span class="rounded bg-transparent px-2 py-0.5 text-sm">{{
            option.content
          }}</span>
          <TagsInputItemDelete />
        </TagsInputItem>
      </div>

      <ComboboxAnchor>
        <ComboboxTrigger as-child>
          <Button variant="outline" size="icon">
            <Plus />
          </Button>
        </ComboboxTrigger>
      </ComboboxAnchor>
    </TagsInput>

    <ComboboxList :portal="props.portal">
      <div class="relative w-full max-w-sm items-center">
        <ComboboxInput
          class="h-10 rounded-none focus-visible:ring-0"
          v-model="search"
          :placeholder
        />
        <span
          class="absolute inset-y-0 inset-s-0 flex items-center justify-center px-3"
        >
          <Search class="size-4 text-muted-foreground" />
        </span>
      </div>

      <ComboboxEmpty v-if="options.length === 0">
        {{ t("没有可用选项") }}
      </ComboboxEmpty>

      <ComboboxViewport @scroll="onScroll">
        <ComboboxGroup v-if="options.length > 0">
          <ComboboxVirtualizer
            v-slot="{ option }"
            :options
            :text-content="(x) => x.content"
            :estimate-size="40"
          >
            <ComboboxItem
              class="w-full"
              @select="
                (e: { detail: { value: PickerOption<T> } }) =>
                  onSelect(e.detail.value as PickerOption<T>)
              "
              :value="option"
            >
              {{ option.content }}

              <ComboboxItemIndicator>
                <Check />
              </ComboboxItemIndicator>
            </ComboboxItem>
          </ComboboxVirtualizer>
        </ComboboxGroup>
      </ComboboxViewport>
    </ComboboxList>
  </Combobox>
</template>
