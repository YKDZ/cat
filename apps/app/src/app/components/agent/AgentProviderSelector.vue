<script setup lang="ts">
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@cat/ui";
import { Check, ChevronDown, Cpu } from "@lucide/vue";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

const props = withDefaults(
  defineProps<{
    providers: { id: number; serviceId: string; name: string }[];
    modelValue: number | null;
    compact?: boolean;
    disabled?: boolean;
  }>(),
  { compact: false, disabled: false },
);

const emit = defineEmits<{
  "update:modelValue": [value: number | null];
}>();

const { t } = useI18n();

const selectedProvider = computed(() => {
  return (
    props.providers.find((provider) => provider.id === props.modelValue) ?? null
  );
});

const triggerLabel = computed(() => {
  if (props.providers.length === 0) return t("暂无可用 LLM Provider");
  return selectedProvider.value?.name ?? t("选择 LLM Provider");
});

const handleSelect = (providerId: number) => {
  if (props.disabled) return;
  emit("update:modelValue", providerId);
};
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        :variant="compact ? 'ghost' : 'outline'"
        :size="compact ? 'sm' : 'default'"
        :disabled="disabled || providers.length === 0"
        class="min-w-0 justify-between gap-2"
        :class="compact ? 'h-8 rounded-full px-2.5 text-xs' : 'w-full'"
      >
        <span class="flex min-w-0 items-center gap-2">
          <Cpu class="size-4 shrink-0" />
          <span class="truncate">{{ triggerLabel }}</span>
        </span>
        <ChevronDown class="size-3.5 shrink-0 opacity-60" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-72">
      <DropdownMenuItem v-if="providers.length === 0" disabled>
        {{ t("暂无可用 LLM Provider") }}
      </DropdownMenuItem>
      <DropdownMenuItem
        v-for="provider in providers"
        :key="provider.id"
        class="items-start gap-3 py-2"
        @click="handleSelect(provider.id)"
      >
        <Cpu class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-medium">{{ provider.name }}</div>
          <div class="truncate text-xs text-muted-foreground">
            {{ provider.serviceId }}
          </div>
        </div>
        <Check
          v-if="modelValue === provider.id"
          class="size-4 shrink-0 text-primary"
        />
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
