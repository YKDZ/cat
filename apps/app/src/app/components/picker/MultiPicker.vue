<script setup lang="ts">
import { ref, computed } from "vue";
import type { PickerOption } from "./index.ts";
import { useFilter, type AcceptableInputValue } from "reka-ui";
import {
  Combobox,
  ComboboxAnchor,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxItemIndicator,
  ComboboxTrigger,
} from "@/app/components/ui/combobox";
import {
  TagsInput,
  TagsInputInput,
  TagsInputItem,
  TagsInputItemDelete,
} from "@/app/components/ui/tags-input";
import { useI18n } from "vue-i18n";
import { Check, ChevronDown, Plus, Search } from "lucide-vue-next";
import { Button } from "@/app/components/ui/button";

const props = withDefaults(
  defineProps<{
    options: PickerOption[];
    placeholder?: string;
    fullWidth?: boolean;
  }>(),
  {
    fullWidth: false,
    placeholder: "",
  },
);

const modelValue = defineModel<AcceptableInputValue[]>({ default: [] });

const { t } = useI18n();
const { contains } = useFilter({ sensitivity: "base" });

const open = ref(false);
const searchTerm = ref("");

const filteredOptions = computed(() => {
  const options = props.options.filter(
    (i) => !modelValue.value.includes(i.value),
  );
  return searchTerm.value
    ? options.filter((option) => contains(option.content, searchTerm.value))
    : options;
});

const onSelect = (value: AcceptableInputValue) => {
  if (typeof value === "string") {
    searchTerm.value = "";
    modelValue.value.push(value);
  }

  if (filteredOptions.value.length === 0) {
    open.value = false;
  }
};

const contentFromValue = (value: AcceptableInputValue): string => {
  const option = props.options.find((i) => i.value === value);
  return option ? option.content : "";
};
</script>

<template>
  <Combobox v-model="modelValue">
    <TagsInput v-model="modelValue" class="px-2 gap-2 min-w-96 w-full">
      <div class="flex gap-2 flex-wrap items-center">
        <TagsInputItem
          v-for="item in modelValue"
          :key="item.toString()"
          :value="item"
        >
          <span class="py-0.5 px-2 text-sm rounded bg-transparent">{{
            contentFromValue(item)
          }}</span>
          <TagsInputItemDelete />
        </TagsInputItem>
      </div>

      <ComboboxAnchor as-child>
        <ComboboxTrigger as-child>
          <Button variant="outline" size="icon">
            <Plus />
          </Button>
        </ComboboxTrigger>
      </ComboboxAnchor>
    </TagsInput>

    <ComboboxList>
      <div class="relative w-full max-w-sm items-center">
        <ComboboxInput
          class="focus-visible:ring-0 rounded-none h-10"
          :placeholder
        />
        <span
          class="absolute start-0 inset-y-0 flex items-center justify-center px-3"
        >
          <Search class="size-4 text-muted-foreground" />
        </span>
      </div>

      <ComboboxEmpty> {{ t("没有可用选项") }} </ComboboxEmpty>

      <ComboboxGroup>
        <ComboboxItem
          v-for="option in filteredOptions"
          :key="option.content"
          :value="option.value"
          @select.prevent="onSelect(option.value)"
        >
          {{ option.content }}

          <ComboboxItemIndicator>
            <Check />
          </ComboboxItemIndicator>
        </ComboboxItem>
      </ComboboxGroup>
    </ComboboxList>
  </Combobox>
</template>
