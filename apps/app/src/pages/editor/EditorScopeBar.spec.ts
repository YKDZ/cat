import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";

import { i18n } from "@/utils/i18n";

import EditorScopeBar from "./EditorScopeBar.vue";

type MockScope = {
  projectId: string;
  languageToId: string;
  branchId?: number;
  contentNodeIds: string[];
  searchQuery: string;
  statusFilter:
    | "all"
    | "untranslated"
    | "translated"
    | "approved"
    | "unapproved";
  page: number;
  pageSize: number;
};

type MockFilter = {
  id: string;
  label: string;
  kind: "FILE" | "DIRECTORY" | "PROJECT_ROOT";
  boundaryType: "HARD" | "SOFT" | "DIRECTORY" | "FILE";
  exportRole: "FILE" | "DIRECTORY";
  includeDescendants: true;
  parentId: string | null;
  path: Array<{
    id: string;
    label: string;
    kind: "FILE" | "DIRECTORY" | "PROJECT_ROOT";
  }>;
};

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  clearContentNodeFilter: vi.fn(),
  setContentNodeFilters: vi.fn(),
  primeStore: ((_: MockScope | null, __: MockFilter[]) => undefined) as (
    scope: MockScope | null,
    filters: MockFilter[],
  ) => void,
}));

vi.mock("@cat/ui", async () => {
  const { defineComponent } = await import("vue");
  const passthrough = (tag: string) =>
    defineComponent({
      inheritAttrs: false,
      template: `<${tag} v-bind="$attrs"><slot /></${tag}>`,
    });

  return {
    Badge: passthrough("span"),
    Button: passthrough("button"),
  };
});

vi.mock("vike/client/router", () => ({
  navigate: mocks.navigate,
}));

vi.mock("@pinia/colada", async () => {
  const { ref } = await import("vue");
  // Simulate a project with multiple available content nodes so
  // hasMultipleContentNodes is true and the filter bar is rendered.
  return {
    useQuery: vi.fn(() => ({
      state: ref({ data: [{ id: "node-a" }, { id: "node-b" }] }),
      isPending: ref(false),
    })),
  };
});

vi.mock("./ContentNodeFilterPicker.vue", () => ({
  default: defineComponent({
    template: '<div data-testid="content-node-filter-picker" />',
  }),
}));

vi.mock("@/components/tooltip/TextTooltip.vue", () => ({
  default: defineComponent({
    template: "<span><slot /></span>",
  }),
}));

vi.mock("@/stores/editor/context", async () => {
  const { defineStore } = await import("pinia");
  const { ref } = await import("vue");

  const scope = ref<MockScope | null>(null);
  const contentNodeFilters = ref<MockFilter[]>([]);

  mocks.primeStore = (nextScope: MockScope | null, filters: MockFilter[]) => {
    scope.value = nextScope;
    contentNodeFilters.value = filters;
  };

  return {
    useEditorContextStore: defineStore("editorContextSpec", () => ({
      scope,
      contentNodeFilters,
      clearContentNodeFilter(id: string) {
        mocks.clearContentNodeFilter(id);
        if (!scope.value) return;

        contentNodeFilters.value = contentNodeFilters.value.filter(
          (filter) => filter.id !== id,
        );
        scope.value = {
          ...scope.value,
          contentNodeIds: scope.value.contentNodeIds.filter(
            (item) => item !== id,
          ),
        };
      },
      setContentNodeFilters(ids: string[]) {
        mocks.setContentNodeFilters(ids);
        if (!scope.value) return;

        contentNodeFilters.value = [];
        scope.value = {
          ...scope.value,
          contentNodeIds: ids,
        };
      },
    })),
  };
});

describe("EditorScopeBar", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const fileNodeId = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.navigate.mockResolvedValue(undefined);
    mocks.clearContentNodeFilter.mockReset();
    mocks.setContentNodeFilters.mockReset();

    mocks.primeStore(
      {
        projectId,
        languageToId: "zh-Hans",
        branchId: 7,
        contentNodeIds: [fileNodeId],
        searchQuery: "",
        statusFilter: "all",
        page: 1,
        pageSize: 16,
      },
      [
        {
          id: fileNodeId,
          label: "README.md",
          kind: "FILE",
          boundaryType: "FILE",
          exportRole: "FILE",
          includeDescendants: true,
          parentId: null,
          path: [{ id: fileNodeId, label: "README.md", kind: "FILE" }],
        },
      ],
    );
  });

  it("removes the last content-node filter and returns to the whole-project URL", async () => {
    const wrapper = mount(EditorScopeBar, {
      global: {
        plugins: [createPinia(), i18n],
      },
    });

    await wrapper
      .get('button[aria-label="移除内容节点过滤器"]')
      .trigger("click");

    expect(mocks.clearContentNodeFilter).toHaveBeenCalledWith(fileNodeId);
    expect(mocks.navigate).toHaveBeenCalledWith(
      `/editor/project/${projectId}/zh-Hans/auto?branchId=7`,
    );
    expect(mocks.navigate.mock.calls[0]?.[0]).not.toContain("nodes=");
  });
});
