export type DataTablePagination = Readonly<{
  pageIndex: number;
  pageSize: number;
}>;

export type DataTableSort<TColumnId extends string = string> = Readonly<{
  desc: boolean;
  id: TColumnId;
}>;

export type DataTableFilters<TFilterId extends string = string> = Readonly<
  Partial<Record<TFilterId, boolean | number | string | undefined>>
>;

export type DataTableColumnVisibility<TColumnId extends string = string> =
  Readonly<Partial<Record<TColumnId, boolean>>>;

export type DataTableColumn<
  TRow,
  TColumnId extends string = string,
> = Readonly<{
  header: string;
  id: TColumnId;
  render?: (row: TRow) => string;
  sortable?: boolean;
}>;

export type DataTableLabels = Readonly<{
  actions: string;
  columns: string;
  empty: string;
  firstPage: string;
  lastPage: string;
  nextPage: string;
  pageSize: string;
  previousPage: string;
  range: (input: { from: number; to: number; total: number }) => string;
  selectAll: string;
  selectRow: (row: string) => string;
  selected: (input: { count: number }) => string;
}>;
