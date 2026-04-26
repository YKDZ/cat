<script setup lang="ts">
import { ScrollArea } from "@cat/ui";
import { useQuery } from "@pinia/colada";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import { orpc } from "@/rpc/orpc";

import ChangeSetEntityGroup from "./ChangeSetEntityGroup.vue";
import ChangeSetSummaryBar from "./ChangeSetSummaryBar.vue";

const { t } = useI18n();

const props = defineProps<{
  changesetId: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const reviewing = ref(false);

const { state: changesetState, refresh: refreshChangeset } = useQuery({
  key: () => ["changeset", props.changesetId],
  query: () => orpc.changeset.get({ externalId: props.changesetId }),
  enabled: !import.meta.env.SSR,
});

const changeset = computed(() => changesetState.value.data);
const entries = computed(() => changeset.value?.entries ?? []);

// Group entries by entityType
const groupedEntries = computed(() => {
  const groups: Record<string, typeof entries.value> = {};
  for (const entry of entries.value) {
    if (!groups[entry.entityType]) {
      groups[entry.entityType] = [];
    }
    groups[entry.entityType]!.push(entry);
  }
  return groups;
});

const handleApproveEntry = async (entryId: number) => {
  reviewing.value = true;
  try {
    await orpc.changeset.review({
      scope: "entry",
      entryId,
      verdict: "APPROVED",
    });
    await refreshChangeset();
  } finally {
    reviewing.value = false;
  }
};

const handleRejectEntry = async (entryId: number) => {
  reviewing.value = true;
  try {
    await orpc.changeset.review({
      scope: "entry",
      entryId,
      verdict: "REJECTED",
    });
    await refreshChangeset();
  } finally {
    reviewing.value = false;
  }
};

const handleApproveAll = async () => {
  if (!changeset.value) return;
  reviewing.value = true;
  try {
    await orpc.changeset.review({
      scope: "changeset",
      changesetId: changeset.value.id,
      verdict: "APPROVED",
    });
    await refreshChangeset();
  } finally {
    reviewing.value = false;
  }
};

const handleRejectAll = async () => {
  if (!changeset.value) return;
  reviewing.value = true;
  try {
    await orpc.changeset.review({
      scope: "changeset",
      changesetId: changeset.value.id,
      verdict: "REJECTED",
    });
    await refreshChangeset();
  } finally {
    reviewing.value = false;
  }
};
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <div class="flex shrink-0 items-center justify-between border-b px-4 py-3">
      <h2 class="text-base font-semibold">{{ t("变更集审核") }}</h2>
      <button
        class="text-muted-foreground transition-colors hover:text-foreground"
        @click="emit('close')"
      >
        ✕
      </button>
    </div>

    <!-- Loading / Error -->
    <div
      v-if="changesetState.status === 'pending'"
      class="flex flex-1 items-center justify-center"
    >
      <span class="text-sm text-muted-foreground">{{ t("加载中...") }}</span>
    </div>
    <div
      v-else-if="changesetState.status === 'error'"
      class="flex flex-1 items-center justify-center"
    >
      <span class="text-sm text-destructive">{{ t("加载失败") }}</span>
    </div>

    <!-- Content -->
    <template v-else-if="changeset">
      <!-- Summary Bar -->
      <div class="shrink-0 border-b px-4 py-3">
        <ChangeSetSummaryBar :status="changeset.status" :entries="entries" />
      </div>

      <!-- Entry groups -->
      <ScrollArea class="min-h-0 flex-1">
        <div class="flex flex-col gap-3 p-4">
          <ChangeSetEntityGroup
            v-for="(groupEntries, entityType) in groupedEntries"
            :key="entityType"
            :entity-type="entityType"
            :entries="groupEntries"
            @approve="handleApproveEntry"
            @reject="handleRejectEntry"
          />
          <div
            v-if="Object.keys(groupedEntries).length === 0"
            class="py-8 text-center text-sm text-muted-foreground"
          >
            {{ t("暂无变更条目") }}
          </div>
        </div>
      </ScrollArea>

      <!-- Footer Actions -->
      <div
        v-if="changeset.status === 'PENDING'"
        class="flex shrink-0 items-center justify-end gap-2 border-t px-4 py-3"
      >
        <button
          class="rounded-md border px-4 py-2 text-sm transition-colors hover:bg-muted/50 disabled:opacity-50"
          :disabled="reviewing"
          @click="handleRejectAll"
        >
          {{ t("整体拒绝") }}
        </button>
        <button
          class="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          :disabled="reviewing"
          @click="handleApproveAll"
        >
          {{ t("整体批准") }}
        </button>
      </div>
    </template>
  </div>
</template>
