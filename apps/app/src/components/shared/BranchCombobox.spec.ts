import type { PullRequest } from "@cat/shared";

import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";

import { useBranchStore } from "@/stores/branch";
import { i18n } from "@/utils/i18n";

const queryState = ref<{ status: string; data: PullRequest[] }>({
  status: "pending",
  data: [],
});

const mocks = vi.hoisted(() => ({
  pageContext: {
    routeParams: {},
    urlParsed: { searchOriginal: "" },
    urlPathname: "/project",
  },
  navigate: vi.fn(),
}));

vi.mock("@pinia/colada", () => ({
  useQuery: vi.fn(() => ({ state: queryState })),
}));

vi.mock("vike-vue/usePageContext", () => ({
  usePageContext: vi.fn(() => mocks.pageContext),
}));

vi.mock("vike/client/router", () => ({
  navigate: mocks.navigate,
}));

vi.mock("@cat/ui", async () => {
  const passthrough = (tag: string) =>
    defineComponent({
      inheritAttrs: false,
      template: `<${tag} v-bind="$attrs"><slot /></${tag}>`,
    });

  return {
    Button: passthrough("button"),
    Combobox: passthrough("div"),
    ComboboxAnchor: passthrough("div"),
    ComboboxEmpty: passthrough("div"),
    ComboboxInput: passthrough("input"),
    ComboboxItem: passthrough("button"),
    ComboboxList: passthrough("div"),
    ComboboxTrigger: passthrough("button"),
  };
});

import BranchCombobox from "./BranchCombobox.vue";

const makePr = (
  input: Partial<PullRequest> & Pick<PullRequest, "id" | "number" | "branchId">,
): PullRequest =>
  ({
    externalId: "33333333-3333-4333-8333-333333333333",
    projectId: "11111111-1111-4111-8111-111111111111",
    title: `PR ${input.number}`,
    body: "",
    status: "OPEN",
    authorId: null,
    authorAgentId: null,
    issueId: null,
    reviewers: [],
    mergedAt: null,
    mergedBy: null,
    metadata: null,
    type: "MANUAL",
    targetLanguageId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...input,
  }) as PullRequest;

describe("BranchCombobox", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const projectB = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    const pinia = createPinia();
    setActivePinia(pinia);
    queryState.value = { status: "pending", data: [] };
    mocks.navigate.mockReset();
    mocks.pageContext.routeParams = {};
    mocks.pageContext.urlParsed = { searchOriginal: "" };
    mocks.pageContext.urlPathname = "/project";
  });

  it("hydrates pending branch metadata when the PR list loads", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useBranchStore();
    store.restoreProjectBranch({ projectId, branchIdFromRoute: 42 });

    const wrapper = mount(BranchCombobox, {
      props: { projectId },
      global: { plugins: [pinia, i18n] },
    });

    expect(wrapper.text()).toContain("branch-42");
    queryState.value = {
      status: "success",
      data: [makePr({ id: 7, number: 3, branchId: 42 })],
    };
    await wrapper.vm.$nextTick();

    expect(store.currentPRId).toBe(7);
    expect(store.currentPRNumber).toBe(3);
    expect(store.currentBranchName).toBe("pr-3");
  });

  it("returns to main and clears stale branch after PR list success", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useBranchStore();
    store.enterBranch({
      projectId,
      branchId: 42,
      prId: 7,
      prNumber: 3,
      branchName: "pr-3",
    });

    const wrapper = mount(BranchCombobox, {
      props: { projectId },
      global: { plugins: [pinia, i18n] },
    });
    queryState.value = { status: "success", data: [] };
    await wrapper.vm.$nextTick();

    expect(store.currentBranchId).toBeNull();
    expect(store.validationStatus).toBe("main");
  });

  it("does not leak branch state across projects", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useBranchStore();
    store.enterBranch({
      projectId,
      branchId: 42,
      prId: 7,
      prNumber: 3,
      branchName: "pr-3",
    });

    const wrapper = mount(BranchCombobox, {
      props: { projectId: projectB },
      global: { plugins: [pinia, i18n] },
    });
    await wrapper.vm.$nextTick();

    expect(store.currentProjectId).toBe(projectB);
    expect(store.currentBranchId).toBeNull();
    expect(wrapper.text()).toContain("main");
  });

  it("syncs branch selection into the editor route query", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useBranchStore();
    const contentNodeId = "33333333-3333-4333-8333-333333333333";

    mocks.pageContext.routeParams = {
      projectId,
      languageToId: "zh-Hans",
      elementId: "101",
    };
    mocks.pageContext.urlParsed = {
      searchOriginal: `?nodes=${contentNodeId}`,
    };
    mocks.pageContext.urlPathname = `/editor/project/${projectId}/zh-Hans/101`;

    mount(BranchCombobox, {
      props: { projectId },
      global: { plugins: [pinia, i18n] },
    });

    store.enterBranch({
      projectId,
      branchId: 42,
      prId: 7,
      prNumber: 3,
      branchName: "pr-3",
    });
    await Promise.resolve();

    expect(mocks.navigate).toHaveBeenCalledWith(
      `/editor/project/${projectId}/zh-Hans/101?nodes=${contentNodeId}&branchId=42`,
    );
  });
});
