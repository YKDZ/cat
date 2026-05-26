import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";

import { useBranchStore } from "@/stores/branch";
import { i18n } from "@/utils/i18n";

const mocks = vi.hoisted(() => ({
  insertTerm: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  rpcWarn: vi.fn(),
}));

vi.mock("@cat/ui", async () => {
  const button = defineComponent({
    inheritAttrs: false,
    template: "<button v-bind=\"$attrs\"><slot /></button>",
  });
  const textarea = defineComponent({
    inheritAttrs: false,
    props: {
      modelValue: {
        type: String,
        default: "",
      },
    },
    emits: ["update:modelValue"],
    template:
      '<textarea data-textarea v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target?.value ?? \'\')" />',
  });

  return {
    Button: button,
    Textarea: textarea,
  };
});

vi.mock("@/components/LanguagePicker.vue", () => ({
  default: defineComponent({
    inheritAttrs: false,
    props: {
      modelValue: {
        type: String,
        default: "",
      },
    },
    emits: ["update:modelValue"],
    template:
      '<input data-language-picker v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target?.value ?? \'\')" />',
  }),
}));

vi.mock("@/rpc/orpc", () => ({
  orpc: {
    glossary: {
      insertTerm: (input: unknown) => mocks.insertTerm(input),
    },
  },
}));

vi.mock("@/stores/toast.ts", () => ({
  useToastStore: () => ({
    info: mocks.info,
    warn: mocks.warn,
    rpcWarn: mocks.rpcWarn,
  }),
}));

import InsertTermText from "./InsertTermText.vue";

const expectedTermsData = [
  {
    term: "hello",
    termLanguageId: "en",
    translation: "你好",
    translationLanguageId: "zh-Hans",
  },
];

const fillForm = async (wrapper: ReturnType<typeof mount>) => {
  const languageInputs = wrapper.findAll("[data-language-picker]");
  const textareas = wrapper.findAll("[data-textarea]");

  const [sourceLanguageInput, targetLanguageInput] = languageInputs;
  const [sourceTermInput, translatedTermInput] = textareas;

  if (
    !sourceLanguageInput ||
    !targetLanguageInput ||
    !sourceTermInput ||
    !translatedTermInput
  ) {
    throw new Error("Expected glossary form inputs to be rendered");
  }

  await sourceLanguageInput.setValue("en");
  await targetLanguageInput.setValue("zh-Hans");
  await sourceTermInput.setValue("hello");
  await translatedTermInput.setValue("你好");
};

describe("InsertTermText", () => {
  beforeEach(() => {
    const pinia = createPinia();
    setActivePinia(pinia);
    mocks.insertTerm.mockReset();
    mocks.insertTerm.mockResolvedValue(undefined);
    mocks.info.mockReset();
    mocks.warn.mockReset();
    mocks.rpcWarn.mockReset();
  });

  it("passes explicit projectId and branchId when the active branch project owns the glossary", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const branchStore = useBranchStore();
    branchStore.enterBranch({
      projectId: "11111111-1111-4111-8111-111111111111",
      branchId: 7,
      prId: 3,
      prNumber: 1,
      branchName: "pr-1",
    });

    const wrapper = mount(InsertTermText, {
      props: {
        glossaryId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        glossaryProjectIds: ["11111111-1111-4111-8111-111111111111"],
      },
      global: {
        plugins: [pinia, i18n],
      },
    });

    await fillForm(wrapper);
    const submitButton = wrapper.findAll("button").at(-1);
    if (!submitButton) {
      throw new Error("Expected the submit button to be rendered");
    }
    await submitButton.trigger("click");
    await flushPromises();

    expect(mocks.insertTerm).toHaveBeenCalledWith({
      glossaryId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      termsData: expectedTermsData,
      projectId: "11111111-1111-4111-8111-111111111111",
      branchId: 7,
    });
  });

  it("omits branch scope when the active project does not own the glossary", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const branchStore = useBranchStore();
    branchStore.enterBranch({
      projectId: "22222222-2222-4222-8222-222222222222",
      branchId: 8,
      prId: 4,
      prNumber: 2,
      branchName: "pr-2",
    });

    const wrapper = mount(InsertTermText, {
      props: {
        glossaryId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        glossaryProjectIds: ["11111111-1111-4111-8111-111111111111"],
      },
      global: {
        plugins: [pinia, i18n],
      },
    });

    await fillForm(wrapper);
    const submitButton = wrapper.findAll("button").at(-1);
    if (!submitButton) {
      throw new Error("Expected the submit button to be rendered");
    }
    await submitButton.trigger("click");
    await flushPromises();

    expect(mocks.insertTerm).toHaveBeenCalledWith({
      glossaryId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      termsData: expectedTermsData,
    });
  });
});
