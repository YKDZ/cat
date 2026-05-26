<script setup lang="ts">
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Pagination,
  PaginationContent,
  PaginationFirst,
  PaginationLast,
  PaginationNext,
  PaginationPrevious,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cat/ui";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  Search,
  Trash2,
} from "@lucide/vue";
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import TextTooltip from "@/components/tooltip/TextTooltip.vue";
import { orpc } from "@/rpc/orpc";
import { useToastStore } from "@/stores/toast.ts";
import { clientLogger as logger } from "@/utils/logger";

type ListMemoryItemsResult = Awaited<ReturnType<typeof orpc.memory.listItems>>;
type MemoryItemRow = ListMemoryItemsResult["items"][number];

const { t } = useI18n();
const { info, rpcWarn } = useToastStore();

const props = defineProps<{
  memoryId: string;
}>();

const items = ref<MemoryItemRow[]>([]);
const pageIndex = ref(1);
const pageSize = ref(20);
const total = ref(0);
const isLoading = ref(false);

const searchTextInput = ref("");
const searchText = ref("");

const deleteDialogOpen = ref(false);
const deleteReason = ref("");
const pendingDeleteItem = ref<MemoryItemRow | null>(null);
const isDeleting = ref(false);

const pageTotalAmount = computed(() =>
  total.value > 0 ? Math.ceil(total.value / pageSize.value) : 1,
);

const displayRange = computed(() => {
  if (total.value === 0) {
    return { from: 0, to: 0 };
  }

  const from = (pageIndex.value - 1) * pageSize.value + 1;
  const to = Math.min(pageIndex.value * pageSize.value, total.value);
  return { from, to };
});

const formatDateTime = (value: Date): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return t("—");
  }
  return date.toLocaleString();
};

const formatCreator = (creatorId: string | null): string => {
  if (!creatorId) return t("系统");
  return `${creatorId.slice(0, 8)}…`;
};

const scopeLabel = (scope: MemoryItemRow["sourceScope"]): string => {
  return scope === "PROJECT" ? t("项目") : t("个人");
};

const promotionStatusLabel = (item: MemoryItemRow): string => {
  if (item.sourceScope === "PROJECT") {
    return t("项目记忆");
  }

  return item.promotedTargetMemoryItemId ? t("已晋升") : t("未晋升");
};

const fetchItems = async () => {
  isLoading.value = true;
  try {
    const result = await orpc.memory.listItems({
      memoryId: props.memoryId,
      pageIndex: pageIndex.value,
      pageSize: pageSize.value,
      searchText: searchText.value.length > 0 ? searchText.value : undefined,
    });

    items.value = result.items;
    total.value = result.total;
  } catch (error) {
    logger.withSituation("WEB").error(error, "Failed to fetch memory items");
    rpcWarn(error);
  } finally {
    isLoading.value = false;
  }
};

const applySearch = async () => {
  searchText.value = searchTextInput.value.trim();
  pageIndex.value = 1;
  await fetchItems();
};

const clearSearch = async () => {
  searchTextInput.value = "";
  searchText.value = "";
  pageIndex.value = 1;
  await fetchItems();
};

const openDeleteDialog = (item: MemoryItemRow) => {
  pendingDeleteItem.value = item;
  deleteReason.value = "";
  deleteDialogOpen.value = true;
};

const closeDeleteDialog = () => {
  pendingDeleteItem.value = null;
  deleteReason.value = "";
  deleteDialogOpen.value = false;
};

const deleteCurrentItem = async () => {
  if (!pendingDeleteItem.value) return;

  isDeleting.value = true;
  try {
    const result = await orpc.memory.deleteItem({
      memoryId: props.memoryId,
      memoryItemId: pendingDeleteItem.value.id,
      reason: deleteReason.value.trim() || undefined,
    });

    closeDeleteDialog();

    if (!result.deleted) {
      info(t("记忆条目不存在或已被删除"));
      await fetchItems();
      return;
    }

    info(t("记忆条目已删除"));

    const nextTotal = Math.max(0, total.value - 1);
    const maxPage = Math.max(1, Math.ceil(nextTotal / pageSize.value));
    if (pageIndex.value > maxPage) {
      pageIndex.value = maxPage;
      return;
    }

    await fetchItems();
  } catch (error) {
    rpcWarn(error);
  } finally {
    isDeleting.value = false;
  }
};

watch(pageIndex, () => {
  void fetchItems();
});

onMounted(() => {
  void fetchItems();
});
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>{{ t("记忆条目") }}</CardTitle>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="flex flex-col gap-2 sm:flex-row">
        <Input
          v-model="searchTextInput"
          :placeholder="t('按源文或译文搜索')"
          @keyup.enter="applySearch"
        />
        <Button variant="outline" @click="applySearch">
          <Search class="mr-2 h-4 w-4" />
          {{ t("搜索") }}
        </Button>
        <Button
          v-if="searchText.length > 0"
          variant="ghost"
          @click="clearSearch"
        >
          {{ t("清除筛选") }}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{{ t("源文") }}</TableHead>
            <TableHead>{{ t("译文") }}</TableHead>
            <TableHead>{{ t("语言") }}</TableHead>
            <TableHead>{{ t("创建者") }}</TableHead>
            <TableHead>{{ t("来源译文 ID") }}</TableHead>
            <TableHead>{{ t("创建时间") }}</TableHead>
            <TableHead>{{ t("来源作用域") }}</TableHead>
            <TableHead>{{ t("晋升状态") }}</TableHead>
            <TableHead class="text-right">{{ t("操作") }}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-if="isLoading">
            <TableRow v-for="i in pageSize" :key="i">
              <TableCell><Skeleton class="h-4 w-48" /></TableCell>
              <TableCell><Skeleton class="h-4 w-48" /></TableCell>
              <TableCell><Skeleton class="h-4 w-24" /></TableCell>
              <TableCell><Skeleton class="h-4 w-24" /></TableCell>
              <TableCell><Skeleton class="h-4 w-16" /></TableCell>
              <TableCell><Skeleton class="h-4 w-32" /></TableCell>
              <TableCell><Skeleton class="h-4 w-16" /></TableCell>
              <TableCell><Skeleton class="h-4 w-16" /></TableCell>
              <TableCell><Skeleton class="ml-auto h-8 w-8" /></TableCell>
            </TableRow>
          </template>

          <template v-else-if="items.length === 0">
            <TableRow>
              <TableCell
                :colspan="9"
                class="py-10 text-center text-muted-foreground"
              >
                {{ t("暂无记忆条目") }}
              </TableCell>
            </TableRow>
          </template>

          <template v-else>
            <TableRow v-for="item in items" :key="item.id">
              <TableCell>
                <div class="max-w-72 truncate" :title="item.source">
                  {{ item.source }}
                </div>
              </TableCell>
              <TableCell>
                <div class="max-w-72 truncate" :title="item.translation">
                  {{ item.translation }}
                </div>
              </TableCell>
              <TableCell>
                {{ item.sourceLanguageId }} → {{ item.translationLanguageId }}
              </TableCell>
              <TableCell>
                <TextTooltip
                  v-if="item.creatorId"
                  :tooltip="item.creatorId"
                  :side="'top'"
                >
                  <span class="cursor-help">{{
                    formatCreator(item.creatorId)
                  }}</span>
                </TextTooltip>
                <span v-else>{{ formatCreator(item.creatorId) }}</span>
              </TableCell>
              <TableCell>{{ item.translationId ?? t("—") }}</TableCell>
              <TableCell>{{ formatDateTime(item.createdAt) }}</TableCell>
              <TableCell>
                <Badge variant="outline">{{
                  scopeLabel(item.sourceScope)
                }}</Badge>
              </TableCell>
              <TableCell>{{ promotionStatusLabel(item) }}</TableCell>
              <TableCell class="text-right">
                <TextTooltip :tooltip="t('删除记忆条目')" :side="'top'">
                  <Button
                    :data-testid="`delete-item-${item.id}`"
                    size="icon-sm"
                    variant="ghost"
                    :disabled="isDeleting"
                    @click="openDeleteDialog(item)"
                  >
                    <Trash2 class="h-4 w-4 text-destructive" />
                  </Button>
                </TextTooltip>
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>

      <div v-if="total > 0" class="flex items-center justify-between">
        <div class="text-sm text-muted-foreground">
          {{
            t("显示 {from} - {to} 条，共 {total} 条", {
              from: displayRange.from,
              to: displayRange.to,
              total,
            })
          }}
        </div>
        <Pagination
          :items-per-page="pageSize"
          :total="total"
          :sibling-count="0"
          v-model:page="pageIndex"
        >
          <PaginationContent class="gap-0.5">
            <PaginationFirst size="icon-sm" class="px-1.5! pr-1.5!">
              <ChevronsLeftIcon class="h-3 w-3" />
            </PaginationFirst>
            <PaginationPrevious size="icon-sm" class="px-1.5! pr-1.5!">
              <ChevronLeftIcon class="h-3 w-3" />
            </PaginationPrevious>

            <div
              class="pointer-events-none flex min-w-12 items-center justify-center px-1"
            >
              <span class="text-xs font-medium tabular-nums">
                {{ pageIndex }}/{{ Math.max(1, pageTotalAmount) }}
              </span>
            </div>

            <PaginationNext size="icon-sm" class="px-1.5! pr-1.5!">
              <ChevronRightIcon class="h-3 w-3" />
            </PaginationNext>
            <PaginationLast size="icon-sm" class="px-1.5! pr-1.5!">
              <ChevronsRightIcon class="h-3 w-3" />
            </PaginationLast>
          </PaginationContent>
        </Pagination>
      </div>
    </CardContent>
  </Card>

  <Dialog v-model:open="deleteDialogOpen">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t("删除记忆条目") }}</DialogTitle>
      </DialogHeader>

      <div class="space-y-3">
        <p class="text-sm text-muted-foreground">
          {{ t("只删除该记忆条目和召回索引，不删除原始译文") }}
        </p>

        <div
          v-if="pendingDeleteItem"
          class="rounded-md border bg-muted/40 p-3 text-sm"
        >
          <p class="truncate" :title="pendingDeleteItem.source">
            <span class="font-medium">{{ t("源文") }}:</span>
            {{ pendingDeleteItem.source }}
          </p>
          <p class="truncate" :title="pendingDeleteItem.translation">
            <span class="font-medium">{{ t("译文") }}:</span>
            {{ pendingDeleteItem.translation }}
          </p>
        </div>

        <Input
          v-model="deleteReason"
          :placeholder="t('可选：填写删除原因')"
          :disabled="isDeleting"
        />
      </div>

      <DialogFooter>
        <Button
          data-testid="memory-delete-cancel"
          variant="outline"
          :disabled="isDeleting"
          @click="closeDeleteDialog"
        >
          {{ t("取消") }}
        </Button>
        <Button
          data-testid="memory-delete-confirm"
          variant="destructive"
          :disabled="isDeleting"
          @click="deleteCurrentItem"
        >
          {{ t("确认删除") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
