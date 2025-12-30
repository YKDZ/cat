<script setup lang="ts" generic="T extends AcceptableInputValue">
import type { PickerOption } from "./index.ts";
import { ComboboxVirtualizer, type AcceptableInputValue } from "reka-ui";
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
  TagsInputItem,
  TagsInputItemDelete,
} from "@/app/components/ui/tags-input";
import { useI18n } from "vue-i18n";
import { Check, Plus, Search } from "lucide-vue-next";
import { Button } from "@/app/components/ui/button";
import ComboboxViewport from "@/app/components/ui/combobox/ComboboxViewport.vue";
import { shallowRef } from "vue";

const { t } = useI18n();

const props = defineProps<{
  options: PickerOption<T>[];
  placeholder?: string;
}>();

const modalValue = defineModel<T[]>({
  default: [],
});

const selectedOptions = shallowRef<PickerOption<T>[]>([]);
const search = defineModel<string>("search", { default: "" });

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
</script>

<template>
  <Combobox :modelValue="selectedOptions" ignore-filter>
    <TagsInput v-model="selectedOptions" class="px-2 gap-2 min-w-96 w-full">
      <div class="flex gap-2 flex-wrap items-center">
        <TagsInputItem
          v-for="option in selectedOptions"
          :key="option.toString()"
          :value="option"
        >
          <span class="py-0.5 px-2 text-sm rounded bg-transparent">{{
            option.content
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
          v-model="search"
          :placeholder
        />
        <span
          class="absolute start-0 inset-y-0 flex items-center justify-center px-3"
        >
          <Search class="size-4 text-muted-foreground" />
        </span>
      </div>

      <ComboboxEmpty> {{ t("没有可用选项") }} </ComboboxEmpty>

      <ComboboxViewport>
        <ComboboxGroup>
          <ComboboxVirtualizer
            v-slot="{ option }"
            :options
            :text-content="(x) => x.content"
            :estimate-size="24"
          >
            <ComboboxItem
              class="w-full"
              @select="(e) => onSelect(e.detail.value as PickerOption<T>)"
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
