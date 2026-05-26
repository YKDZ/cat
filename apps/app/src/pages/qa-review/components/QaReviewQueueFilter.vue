<script setup lang="ts">
import { Badge } from "@cat/ui";
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";

import { useQaReviewWorkbenchStore } from "@/stores/qa-review/workbench";

const { t } = useI18n();
const { total } = storeToRefs(useQaReviewWorkbenchStore());
</script>

<template>
  <Badge variant="secondary">
    {{ t("{count} 个待审元素", { count: total }) }}
  </Badge>
</template>
