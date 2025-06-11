import { useEditorStore } from "@/app/stores/editor";
import type { TranslatableElement } from "@cat/shared";
import { createPinia, setActivePinia, storeToRefs } from "pinia";
import { test } from "vitest";

beforeEach(() => {
  setActivePinia(createPinia());
});

test("upsertElements should update element", () => {
  const { upsertElements } = useEditorStore();

  const { element, displayedElements, elementId } =
    storeToRefs(useEditorStore());

  elementId.value = 1;

  expect(element.value).toBeNull();

  const elementToAdd = {
    id: 1,
    embeddingId: 1,
    meta: {},
    status: "NO",
    value: "test",
  } satisfies TranslatableElement;

  upsertElements(elementToAdd);

  expect(element.value).toStrictEqual(elementToAdd);
});
