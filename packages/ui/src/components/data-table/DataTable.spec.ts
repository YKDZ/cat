import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import DropdownMenuCheckboxItem from "#/components/dropdown-menu/DropdownMenuCheckboxItem.vue";

import DataTable from "./DataTable.vue";
import type {
  DataTableColumn,
  DataTableLabels,
  DataTablePagination,
} from "./types.ts";

const columns: readonly DataTableColumn<object>[] = [
  { id: "name", header: "Name", sortable: true },
  { id: "status", header: "Status", sortable: true },
];

const labels: DataTableLabels = {
  actions: "Actions",
  columns: "Columns",
  empty: "Nothing here",
  firstPage: "First page",
  lastPage: "Last page",
  nextPage: "Next page",
  pageSize: "Rows per page",
  previousPage: "Previous page",
  range: ({ from, to, total }) => `${from}-${to} of ${total}`,
  selectAll: "Select all rows",
  selectRow: (row) => `Select ${row}`,
  selected: ({ count }) => `${count} selected`,
};

const pagination: DataTablePagination = { pageIndex: 0, pageSize: 10 };
const rowKey = (row: object): string =>
  "id" in row && typeof row.id === "string" ? row.id : "";

describe("DataTable", () => {
  it("emits controlled server pagination, sorting, filters, and page-size changes", async () => {
    const wrapper = mount(DataTable, {
      props: {
        columns,
        columnVisibility: {},
        filters: { status: "active" },
        labels,
        pageSizeOptions: [10, 25],
        pagination,
        rowCount: 23,
        rowKey,
        rows: [{ id: "one", name: "One", status: "active" }],
        sorting: [],
      },
      slots: {
        toolbar: `<template #default="slotProps"><button data-testid="filter" @click="slotProps.setFilters({ status: 'archived' })">filter</button></template>`,
      },
    });

    await wrapper.get('button[aria-label="Name"]').trigger("click");
    expect(wrapper.emitted("update:sorting")?.[0]).toEqual([
      [{ id: "name", desc: false }],
    ]);

    await wrapper.get('[data-testid="filter"]').trigger("click");
    expect(wrapper.emitted("update:filters")?.[0]).toEqual([
      { status: "archived" },
    ]);

    await wrapper.get('select[aria-label="Rows per page"]').setValue("25");
    expect(wrapper.emitted("update:pagination")?.[0]).toEqual([
      { pageIndex: 0, pageSize: 25 },
    ]);

    await wrapper.get('button[aria-label="Next page"]').trigger("click");
    expect(wrapper.emitted("update:pagination")?.[1]).toEqual([
      { pageIndex: 1, pageSize: 10 },
    ]);
  });

  it("keeps selection and column visibility controlled and renders caller slots", async () => {
    const wrapper = mount(DataTable, {
      props: {
        columnVisibility: { name: true, status: true },
        columns,
        filters: {},
        labels,
        pagination,
        rowCount: 1,
        rowKey,
        rows: [{ id: "one", name: "One", status: "active" }],
        selection: [],
        sorting: [],
      },
      slots: {
        "cell-name": `<template #default="{ row }"><strong data-testid="name">{{ row.name }}</strong></template>`,
        "bulk-actions": `<template #default="{ selectedRows }"><span data-testid="bulk">{{ selectedRows.length }}</span></template>`,
      },
    });

    expect(wrapper.get('[data-testid="name"]').text()).toBe("One");
    await wrapper.get('input[aria-label="Select one"]').setValue(true);
    expect(wrapper.emitted("update:selection")?.[0]).toEqual([["one"]]);

    await wrapper.get('button[aria-label="Columns"]').trigger("click");
    const statusToggle = wrapper
      .findAllComponents(DropdownMenuCheckboxItem)
      .find((item) => item.attributes("aria-label") === "Status");
    if (!statusToggle)
      throw new Error("Column visibility control was not rendered.");
    statusToggle.vm.$emit("update:checked", false);
    expect(wrapper.emitted("update:columnVisibility")?.[0]).toEqual([
      { name: true, status: false },
    ]);

    await wrapper.setProps({ columnVisibility: { name: true, status: false } });
    const restoredStatusToggle = wrapper
      .findAllComponents(DropdownMenuCheckboxItem)
      .find((item) => item.attributes("aria-label") === "Status");
    if (!restoredStatusToggle)
      throw new Error("Column visibility control was not rendered.");
    expect(restoredStatusToggle.props("disabled")).toBe(false);
    restoredStatusToggle.vm.$emit("update:checked", true);
    expect(wrapper.emitted("update:columnVisibility")?.[1]).toEqual([
      { name: true, status: true },
    ]);
  });

  it("renders a skeleton while loading and a stable empty state without rows", () => {
    const loading = mount(DataTable, {
      props: {
        columnVisibility: {},
        columns,
        filters: {},
        labels,
        loading: true,
        pagination,
        rowCount: 0,
        rowKey,
        rows: [],
        sorting: [],
      },
    });
    expect(loading.findAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(loading.text()).not.toContain("Nothing here");

    const empty = mount(DataTable, {
      props: {
        columns,
        columnVisibility: {},
        filters: {},
        labels,
        pagination,
        rowCount: 0,
        rowKey,
        rows: [],
        sorting: [],
      },
    });
    expect(empty.text()).toContain("Nothing here");
    expect(empty.get("[data-data-table]").attributes("aria-busy")).toBe(
      "false",
    );
  });

  it("keeps the final visible column available and selection global across pages", async () => {
    const wrapper = mount(DataTable, {
      props: {
        columnVisibility: { name: true, status: false },
        columns,
        filters: {},
        hasNext: true,
        labels,
        pagination,
        paginationMode: "cursor",
        rowCount: 20,
        rowKey,
        rows: [
          { id: "one", name: "One", status: "active" },
          { id: "two", name: "Two", status: "active" },
        ],
        selection: ["previous-page", "one"],
        sorting: [],
      },
    });

    expect(wrapper.text()).toContain("2 selected");
    await wrapper.get('button[aria-label="Columns"]').trigger("click");
    const nameToggle = wrapper
      .findAllComponents(DropdownMenuCheckboxItem)
      .find((item) => item.attributes("aria-label") === "Name");
    if (!nameToggle)
      throw new Error("Column visibility control was not rendered.");
    expect(nameToggle.props("disabled")).toBe(true);
    nameToggle.vm.$emit("update:checked", false);
    expect(wrapper.emitted("update:columnVisibility")).toBeUndefined();

    const selectAll = wrapper.get('input[aria-label="Select all rows"]');
    expect((selectAll.element as HTMLInputElement).indeterminate).toBe(true);
    await selectAll.setValue(true);
    expect(wrapper.emitted("update:selection")?.[0]).toEqual([
      ["previous-page", "one", "two"],
    ]);

    await wrapper.setProps({
      columnVisibility: { name: false, status: false },
      rows: [],
    });
    expect(wrapper.findAll("th")).toHaveLength(2);
    expect(wrapper.get("tbody td").attributes("colspan")).not.toBe("0");

    const statusToggle = wrapper
      .findAllComponents(DropdownMenuCheckboxItem)
      .find((item) => item.attributes("aria-label") === "Status");
    if (!statusToggle)
      throw new Error("Column visibility control was not rendered.");
    expect(statusToggle.props("disabled")).toBe(false);
    statusToggle.vm.$emit("update:checked", true);
    expect(wrapper.emitted("update:columnVisibility")?.[0]).toEqual([
      { name: false, status: true },
    ]);
  });

  it("uses a native row action for mouse and keyboard navigation without exposing cursor first or last jumps", async () => {
    const wrapper = mount(DataTable, {
      props: {
        columnVisibility: {},
        columns,
        filters: {},
        hasNext: true,
        hasPrevious: false,
        labels,
        pagination,
        paginationMode: "cursor",
        rowActionLabel: (row: object) => rowKey(row),
        rowCount: 20,
        rowKey,
        rows: [{ id: "one", name: "One", status: "active" }],
        sorting: [],
      },
      slots: {
        "cell-status": '<button data-testid="row-control">status</button>',
        commands: '<button data-testid="command">command</button>',
      },
    });

    await wrapper.get("button[data-row-action]").trigger("click");
    expect(wrapper.emitted("row-click")).toEqual([
      [{ id: "one", name: "One", status: "active" }],
    ]);
    await wrapper.get('tr[data-row-id="one"]').trigger("click");
    expect(wrapper.emitted("row-click")).toHaveLength(2);
    await wrapper.get('[data-testid="row-control"]').trigger("click");
    expect(wrapper.emitted("row-click")).toHaveLength(2);
    expect(wrapper.get('[data-testid="command"]').text()).toBe("command");
    expect(wrapper.find('[title="First page"]').exists()).toBe(false);
    expect(wrapper.find('[title="Last page"]').exists()).toBe(false);
    await wrapper.get('[title="Next page"]').trigger("click");
    expect(wrapper.emitted("update:pagination")?.[0]).toEqual([
      { pageIndex: 1, pageSize: 10 },
    ]);
  });

  it("keeps a standalone navigation action when the actions column is the only visible column", async () => {
    const wrapper = mount(DataTable, {
      props: {
        columnVisibility: { actions: false },
        columns: [{ id: "actions", header: "Actions" }],
        filters: {},
        labels,
        pagination,
        rowActionLabel: (row: object) => rowKey(row),
        rowCount: 1,
        rowKey,
        rows: [{ id: "one" }],
        sorting: [],
      },
      slots: {
        "cell-actions": '<button data-testid="row-control">cancel</button>',
      },
    });

    const rowAction = wrapper.get("button[data-row-action]");
    expect(rowAction.find('[data-testid="row-control"]').exists()).toBe(false);
    await wrapper.get('[data-testid="row-control"]').trigger("click");
    expect(wrapper.emitted("row-click")).toBeUndefined();
    await rowAction.trigger("click");
    expect(wrapper.emitted("row-click")).toEqual([[{ id: "one" }]]);
  });
});
