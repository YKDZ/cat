import type { DataTableFilters } from "@cat/ui";
import { computed, onScopeDispose, ref, type Ref } from "vue";

type SearchFilterId = "search";

export const useDataTableSearch = (pageIndex: Ref<number>) => {
  const filters = ref<DataTableFilters<SearchFilterId>>({});
  const searchInput = ref("");
  const search = computed(() => {
    const value = filters.value.search;
    return typeof value === "string" ? value : "";
  });

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const cancelSearchCommit = () => {
    if (debounceTimer === undefined) return;
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  };
  onScopeDispose(cancelSearchCommit);

  const commitSearch = (value: string) => {
    cancelSearchCommit();
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      const normalized = value.trim();
      if (normalized === search.value) return;
      filters.value = normalized === "" ? {} : { search: normalized };
      pageIndex.value = 0;
    }, 250);
  };

  const updateSearch = (value: string | number) => {
    searchInput.value = String(value);
    commitSearch(searchInput.value);
  };

  return { filters, search, searchInput, updateSearch };
};

export const toSearchRequestArgument = (search: string): [] | [string] =>
  search === "" ? [] : [search];
