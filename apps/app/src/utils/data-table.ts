import type { DataTableLabels } from "@cat/ui";

type Translate = (
  key: string,
  values?: Record<string, number | string>,
) => string;

export const createDataTableLabels = (t: Translate): DataTableLabels => ({
  actions: t("操作"),
  columns: t("列"),
  empty: t("暂无数据"),
  firstPage: t("第一页"),
  lastPage: t("最后一页"),
  nextPage: t("下一页"),
  pageSize: t("每页条数"),
  previousPage: t("上一页"),
  range: ({ from, to, total }) =>
    t("显示 {from} - {to} 条，共 {total} 条", { from, to, total }),
  selectAll: t("选择全部"),
  selectRow: (row) => t("选择 {row}", { row }),
  selected: ({ count }) => t("已选择 {count} 条", { count }),
});
