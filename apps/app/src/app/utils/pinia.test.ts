import { createPinia, defineStore } from "pinia";
import { assertType, expect, test } from "vitest";
import { ref } from "vue";
import { injectPiniaData } from "./pinia";

test("should inject data properly", () => {
  const pinia = createPinia();
  const rawData = {
    arr: ["test", "strings"],
    object: {
      a: "1",
      b: "2",
    },
  };

  const useTestStore = defineStore("test", () => {
    const values = ref<typeof rawData>();
    return { values };
  });

  injectPiniaData<typeof rawData>((pinia, data) => {
    assertType<typeof rawData>(data);
    useTestStore(pinia).values = data;
  })({ data: rawData, pinia, isPrerendering: false });

  expect(useTestStore(pinia).values).toStrictEqual(rawData);
});
