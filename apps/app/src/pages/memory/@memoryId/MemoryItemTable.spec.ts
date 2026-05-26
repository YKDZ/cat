import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { i18n } from "../../../utils/i18n";

const mocks = vi.hoisted(() => ({
  listItems: vi.fn(),
  deleteItem: vi.fn(),
  info: vi.fn(),
  rpcWarn: vi.fn(),
}));

vi.mock("@/rpc/orpc", () => ({
  orpc: {
    memory: {
      listItems: mocks.listItems,
      deleteItem: mocks.deleteItem,
    },
  },
}));

vi.mock("@/stores/toast.ts", () => ({
  useToastStore: () => ({
    info: mocks.info,
    rpcWarn: mocks.rpcWarn,
  }),
}));

import MemoryItemTable from "./MemoryItemTable.vue";

const memoryId = "11111111-1111-4111-8111-111111111111";

const row = (id: number, overrides: Partial<Record<string, unknown>> = {}) => ({
  id,
  memoryId,
  source: `Source ${id}`,
  translation: `Translation ${id}`,
  sourceLanguageId: "en",
  translationLanguageId: "zh-Hans",
  sourceElementId: null,
  translationId: id,
  creatorId: "22222222-2222-4222-8222-222222222222",
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  sourceScope: "PROJECT" as const,
  promotedTargetMemoryItemId: null,
  ...overrides,
});

const mountTable = () =>
  mount(MemoryItemTable, {
    props: { memoryId },
    global: {
      plugins: [i18n],
      stubs: {
        teleport: true,
      },
    },
  });

type MemoryItemTableVmController = {
  pendingDeleteItem: ReturnType<typeof row> | null;
  deleteCurrentItem: () => Promise<void>;
};

const isMemoryItemTableVmController = (
  value: unknown,
): value is MemoryItemTableVmController =>
  typeof value === "object" &&
  value !== null &&
  Reflect.has(value, "pendingDeleteItem") &&
  typeof Reflect.get(value, "deleteCurrentItem") === "function";

describe("MemoryItemTable", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mocks.listItems.mockReset();
    mocks.deleteItem.mockReset();
    mocks.info.mockReset();
    mocks.rpcWarn.mockReset();
  });

  it("renders empty state when memory has no items", async () => {
    mocks.listItems.mockResolvedValueOnce({ total: 0, items: [] });

    const wrapper = mountTable();
    await flushPromises();

    expect(mocks.listItems).toHaveBeenCalledWith({
      memoryId,
      pageIndex: 1,
      pageSize: 20,
      searchText: undefined,
    });
    expect(wrapper.text()).toContain("暂无记忆条目");
  });

  it("renders paged rows and refreshes after successful delete", async () => {
    mocks.listItems
      .mockResolvedValueOnce({ total: 2, items: [row(1), row(2)] })
      .mockResolvedValueOnce({ total: 1, items: [row(2)] });
    mocks.deleteItem.mockResolvedValueOnce({ deleted: true });

    const wrapper = mountTable();
    await flushPromises();

    expect(wrapper.text()).toContain("Source 1");
    expect(wrapper.text()).toContain("Source 2");

    const vm = wrapper.vm;
    if (!isMemoryItemTableVmController(vm)) {
      throw new Error("MemoryItemTable VM controller is not available in test");
    }
    vm.pendingDeleteItem = row(1);
    await vm.deleteCurrentItem();
    await flushPromises();

    expect(mocks.deleteItem).toHaveBeenCalledWith({
      memoryId,
      memoryItemId: 1,
      reason: undefined,
    });
    expect(mocks.info).toHaveBeenCalledWith("记忆条目已删除");
    expect(mocks.listItems).toHaveBeenCalledTimes(2);
  });

  it("keeps current page state when delete fails and shows warning", async () => {
    mocks.listItems.mockResolvedValueOnce({ total: 1, items: [row(1)] });
    mocks.deleteItem.mockRejectedValueOnce(new Error("delete failed"));

    const wrapper = mountTable();
    await flushPromises();

    const vm = wrapper.vm;
    if (!isMemoryItemTableVmController(vm)) {
      throw new Error("MemoryItemTable VM controller is not available in test");
    }
    vm.pendingDeleteItem = row(1);
    await vm.deleteCurrentItem();
    await flushPromises();

    expect(mocks.rpcWarn).toHaveBeenCalledTimes(1);
    expect(mocks.listItems).toHaveBeenCalledTimes(1);
  });
});
