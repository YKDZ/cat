import { afterEach, describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";

import { useDataTableSearch } from "./data-table-search.ts";

describe("data table search", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("commits only the final rapid search input", () => {
    vi.useFakeTimers();
    const pageIndex = ref(0);
    const scope = effectScope();
    const search = scope.run(() => useDataTableSearch(pageIndex));
    if (!search) throw new TypeError("Search scope did not initialize.");

    search.updateSearch("first");
    search.updateSearch("second");
    search.updateSearch("final");
    vi.advanceTimersByTime(249);
    expect(search.filters.value).toEqual({});

    vi.advanceTimersByTime(1);
    expect(search.filters.value).toEqual({ search: "final" });
    scope.stop();
  });

  it("resets a later page when the search commits", () => {
    vi.useFakeTimers();
    const pageIndex = ref(3);
    const scope = effectScope();
    const search = scope.run(() => useDataTableSearch(pageIndex));
    if (!search) throw new TypeError("Search scope did not initialize.");

    search.updateSearch("needle");
    vi.advanceTimersByTime(250);

    expect(pageIndex.value).toBe(0);
    scope.stop();
  });

  it("cancels a pending search when its scope is disposed", () => {
    vi.useFakeTimers();
    const pageIndex = ref(2);
    const scope = effectScope();
    const search = scope.run(() => useDataTableSearch(pageIndex));
    if (!search) throw new TypeError("Search scope did not initialize.");

    search.updateSearch("discarded");
    scope.stop();
    vi.advanceTimersByTime(250);

    expect(search.filters.value).toEqual({});
    expect(pageIndex.value).toBe(2);
  });
});
