<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { PickerOption } from "./index.ts";
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
} from "@/app/components/ui/combobox";
import { Check, ChevronDown, Search } from "lucide-vue-next";
import type { AcceptableInputValue } from "reka-ui";
import { Button } from "@/app/components/ui/button";

const { t } = useI18n();

const props = defineProps<{
  options: PickerOption[];
  placeholder?: string;
}>();

const value = defineModel<AcceptableInputValue | undefined>();

const contentFromValue = (value: AcceptableInputValue | undefined) => {
  return props.options.find((option) => option.value === value)?.content ?? "";
};
</script>

<template>
  <Combobox v-model="value" by="label">
    <ComboboxAnchor as-child>
      <ComboboxTrigger as-child>
        <Button variant="outline" class="justify-between">
          {{ contentFromValue(value) ?? placeholder }}
          <ChevronDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </ComboboxTrigger>
    </ComboboxAnchor>

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
          v-for="option in options"
          :key="option.content"
          :value="option.value"
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
