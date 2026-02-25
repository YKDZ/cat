<script setup lang="ts">
import { ref, onMounted, watch, computed } from "vue";
import { usePageContext } from "vike-vue/usePageContext";
import {
  onRequestProjects,
  type ProjectListItem,
} from "./ProjectTable.telefunc";
import ListItem from "./ListItem.vue";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from "@/app/components/ui/table";
import { Button } from "@/app/components/ui/button";
import Skeleton from "@/app/components/ui/skeleton/Skeleton.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const ctx = usePageContext();

const projects = ref<ProjectListItem[]>([]);
const pageIndex = ref(0);
const pageSize = ref(10);
const total = ref(0);
const isLoading = ref(false);

const totalPages = computed(() =>
  total.value > 0 ? Math.ceil(total.value / pageSize.value) : 0,
);

const fetchProjects = async () => {
  if (!ctx.user) return;

  isLoading.value = true;
  try {
    const result = await onRequestProjects(
      ctx.user.id,
      pageIndex.value,
      pageSize.value,
    );
    projects.value = result.data;
    total.value = result.total;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to fetch projects:", err);
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  fetchProjects();
});

watch([pageIndex], () => {
  fetchProjects();
});

const goToPage = (page: number) => {
  if (page >= 0 && page < totalPages.value) {
    pageIndex.value = page;
  }
};
</script>

<template>
  <div class="w-full">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{{ t("名称") }}</TableHead>
          <TableHead>{{ t("描述") }}</TableHead>
          <TableHead>{{ t("创建时间") }}</TableHead>
          <TableHead>{{ t("更新时间") }}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <template v-if="isLoading">
          <TableRow v-for="i in pageSize" :key="i">
            <TableCell>
              <Skeleton class="h-4 w-32" />
            </TableCell>
            <TableCell>
              <Skeleton class="h-4 w-48" />
            </TableCell>
            <TableCell>
              <Skeleton class="h-4 w-24" />
            </TableCell>
            <TableCell>
              <Skeleton class="h-4 w-24" />
            </TableCell>
          </TableRow>
        </template>
        <template v-else-if="projects.length === 0">
          <TableRow>
            <TableCell :colspan="4" class="text-center text-gray-500 py-8">
              {{ t("暂无数据") }}
            </TableCell>
          </TableRow>
        </template>
        <template v-else>
          <ListItem v-for="project in projects" :key="project.id" :project />
        </template>
      </TableBody>
    </Table>

    <!-- 分页 -->
    <div v-if="total > 0" class="flex items-center justify-between mt-4">
      <div class="text-sm text-gray-600">
        {{
          t("显示 {from} - {to} 条，共 {total} 条", {
            from: pageIndex * pageSize + 1,
            to: Math.min((pageIndex + 1) * pageSize, total),
            total: total,
          })
        }}
      </div>
      <div class="flex gap-2">
        <Button
          variant="outline"
          :disabled="pageIndex <= 0"
          @click="goToPage(pageIndex - 1)"
        >
          {{ t("上一页") }}
        </Button>

        <span class="px-3 py-1 border rounded">
          {{ pageIndex + 1 }} / {{ totalPages }}
        </span>

        <Button
          variant="outline"
          :disabled="pageIndex >= totalPages - 1"
          @click="goToPage(pageIndex + 1)"
        >
          {{ t("下一页") }}
        </Button>
      </div>
    </div>
  </div>
</template>
