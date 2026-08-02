import {
  BatchAutoTranslationInvocationSchema,
  type TaskKind,
  TaskKindSchema,
  type TaskState,
  TaskStateSchema,
} from "@cat/shared";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (value: string) => value }),
}));

import TaskTable from "./TaskTable.vue";

type TaskTableRow = {
  id: string;
  task: TaskKind;
  state: TaskState;
  createdAt: Date | string;
  updatedAt: Date | string;
  startedAt: Date | string | null;
  finishedAt: Date | string | null;
};

const row: TaskTableRow = {
  id: "11111111-1111-4111-8111-111111111111",
  task: TaskKindSchema.parse({
    kind: "BATCH_AUTO_TRANSLATION",
    payload: {
      invocation: BatchAutoTranslationInvocationSchema.parse({
        projectId: "22222222-2222-4222-8222-222222222222",
        contentNodeIds: [],
        elementIds: [],
        sortMode: "structure",
        languageId: "zh-Hans",
        minMemorySimilarity: 0.72,
        maxMemoryAmount: 3,
        memoryVectorStorage: {
          pluginId: "test.vector",
          serviceId: "default",
          serviceType: "VECTOR_STORAGE",
          scopeType: "GLOBAL",
          scopeId: "",
        },
        translationVectorStorage: {
          pluginId: "test.vector",
          serviceId: "default",
          serviceType: "VECTOR_STORAGE",
          scopeType: "GLOBAL",
          scopeId: "",
        },
        vectorizer: {
          pluginId: "test.vectorizer",
          serviceId: "default",
          serviceType: "TEXT_VECTORIZER",
          scopeType: "GLOBAL",
          scopeId: "",
        },
        translatorId: "33333333-3333-4333-8333-333333333333",
        memoryIds: [],
        glossaryIds: [],
      }),
      cancelable: true,
    },
  }),
  state: TaskStateSchema.parse({
    status: "BLOCKED",
    scope: { type: "PROJECT", id: "22222222-2222-4222-8222-222222222222" },
    actor: { type: "USER", id: "33333333-3333-4333-8333-333333333333" },
    resources: [
      { type: "PROJECT", id: "22222222-2222-4222-8222-222222222222" },
    ],
    revision: 2,
    progressCurrent: null,
    progressTotal: null,
    runtime: {
      kind: "BATCH_AUTO_TRANSLATION",
      phase: "PREPARING",
      result: null,
    },
    currentFailureId: "55555555-5555-4555-8555-555555555555",
    retryOfTaskId: null,
  }),
  createdAt: new Date(),
  updatedAt: new Date(),
  startedAt: new Date(),
  finishedAt: null,
};

describe("TaskTable", () => {
  it("offers resume for a blocked task and reflects loading and action errors", async () => {
    const wrapper = mount(TaskTable, {
      props: {
        data: [row],
        hasPrevious: false,
        hasMore: false,
        actionError: "Not permitted to resume this task.",
      },
      global: {
        components: {
          Button: { template: "<button><slot /></button>" },
        },
      },
    });

    const resumeButton = wrapper
      .findAll("button")
      .find((button) => button.attributes("title") === "恢复");
    expect(resumeButton).toBeDefined();
    await resumeButton?.trigger("click");
    expect(wrapper.emitted("resume")?.[0]).toEqual([row]);
    expect(wrapper.text()).toContain("Not permitted to resume this task.");

    await wrapper.setProps({ actionBusy: true });
    expect(resumeButton?.attributes("disabled")).toBeDefined();
  });

  it("emits controlled filter and cursor pagination intents", async () => {
    const wrapper = mount(TaskTable, {
      props: {
        data: [row],
        hasPrevious: true,
        hasMore: true,
      },
      global: {
        components: {
          Button: { template: "<button><slot /></button>" },
        },
      },
    });

    await wrapper.get("select").setValue("FAILED");
    expect(wrapper.emitted("update:status")?.[0]).toEqual(["FAILED"]);

    const statusSelect = wrapper.get("select");
    (statusSelect.element as HTMLSelectElement).value = "UNKNOWN";
    await statusSelect.trigger("change");
    expect(wrapper.emitted("update:status")?.[1]).toEqual([undefined]);

    const previous = wrapper
      .findAll("button")
      .find((button) => button.text() === "上一页");
    const next = wrapper
      .findAll("button")
      .find((button) => button.text() === "下一页");
    await previous?.trigger("click");
    await next?.trigger("click");

    expect(wrapper.emitted("previous")).toHaveLength(1);
    expect(wrapper.emitted("next")).toHaveLength(1);
  });
});
