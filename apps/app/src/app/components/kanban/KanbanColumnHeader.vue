<script setup lang="ts">
import { useI18n } from "vue-i18n";

const props = defineProps<{
  /** @zh 列标题 @en Column title */
  title: string;
  /** @zh 卡片数量 @en Card count */
  count: number;
  /** @zh WIP 限制（可选）@en WIP limit (optional) */
  wipLimit?: number;
}>();

const { t } = useI18n();

const isOverLimit = () =>
  props.wipLimit !== undefined && props.count > props.wipLimit;
</script>

<template>
  <div class="flex items-center justify-between px-3 py-2">
    <h3 class="text-sm font-semibold text-foreground">{{ title }}</h3>
    <div class="flex items-center gap-1.5">
      <span
        class="rounded-full px-2 py-0.5 text-xs font-medium"
        :class="
          isOverLimit()
            ? 'bg-destructive/15 text-destructive'
            : 'bg-muted text-muted-foreground'
        "
      >
        {{ count }}
        <template v-if="wipLimit !== undefined"> / {{ wipLimit }} </template>
      </span>
      <span
        v-if="isOverLimit()"
        class="text-xs text-destructive"
        :title="t('已超过 WIP 限制')"
      >
        !
      </span>
    </div>
  </div>
</template>
