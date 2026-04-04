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
  Button,
} from "@cat/ui";
import { Check, ChevronDown, Search, X } from "@lucide/vue";
import {
  ComboboxCancel,
  ComboboxVirtualizer,
  type AcceptableInputValue,
} from "reka-ui";
import { ref } from "vue";
import { useI18n } from "vue-i18n";

import TextTooltip from "@/app/components/tooltip/TextTooltip.vue";

import type { PickerOption } from "./index.ts";

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    options: PickerOption<T>[];
    placeholder: string;
    loadMore?: () => void;
    portal?: boolean;
  }>(),
  {
    portal: true,
  },
);

const modelValue = defineModel<T>();
const search = defineModel<string>("search", { default: "" });

const selectedOption = ref<PickerOption<T>>();

const onSelect = (value: PickerOption<T> | undefined) => {
  selectedOption.value =
    selectedOption.value?.value === value?.value ? undefined : value;
  modelValue.value = selectedOption.value?.value ?? undefined;
};

const onScroll = (e: Event) => {
  const target = e.target as HTMLElement;
  if (target.scrollTop + target.clientHeight >= target.scrollHeight - 20) {
    props.loadMore?.();
  }
};
</script>

<template>
  <Combobox :modelValue="selectedOption" by="label" ignore-filter>
    <ComboboxAnchor class="flex w-fit min-w-48 gap-1">
      <ComboboxTrigger as-child>
        <Button variant="outline" class="w-full">
          {{ selectedOption?.content ?? placeholder }}
          <ChevronDown class="ml-auto h-4 w-4 shrink-0 self-end opacity-50" />
        </Button>
      </ComboboxTrigger>
      <ComboboxCancel as-child>
        <TextTooltip :tooltip="t('清除选项')">
          <Button
            v-if="selectedOption"
            @click="onSelect(selectedOption)"
            variant="ghost"
            size="icon"
          >
            <X />
          </Button>
        </TextTooltip>
      </ComboboxCancel>
    </ComboboxAnchor>

    <ComboboxList :portal="props.portal">
      <div class="relative w-full max-w-sm items-center">
        <ComboboxInput
          class="pointer-events-auto h-10 rounded-none focus-visible:ring-0"
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

              <ComboboxItemIndicator
                v-if="selectedOption?.value === option.value"
              >
                <Check />
              </ComboboxItemIndicator>
            </ComboboxItem>
          </ComboboxVirtualizer> </ComboboxGroup
      ></ComboboxViewport>
    </ComboboxList>
  </Combobox>
</template>
