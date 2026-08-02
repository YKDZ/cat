import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  request: vi.fn(),
}));

vi.mock("vike-vue/usePageContext", () => ({
  usePageContext: () => ({ user: { id: "user-1" } }),
}));
vi.mock("vike/client/router", () => ({ navigate: mocks.navigate }));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("#/utils/logger.ts", () => ({
  clientLogger: { child: () => ({ error: vi.fn() }) },
}));
vi.mock("./Table.telefunc.ts", () => ({ onRequestGlossaries: mocks.request }));

import GlossaryTable from "./Table.vue";

describe("Glossary table", () => {
  it("keeps glossary fetching and navigation outside the controlled DataTable", async () => {
    mocks.request.mockResolvedValue({
      data: [
        {
          createdAt: "2026-08-01T00:00:00.000Z",
          description: null,
          id: "glossary-1",
          name: "Glossary one",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      total: 21,
    });
    const wrapper = mount(GlossaryTable);
    await flushPromises();

    expect(mocks.request).toHaveBeenCalledWith(0, 10);
    await wrapper.get('select[aria-label="每页条数"]').setValue("20");
    await flushPromises();
    expect(mocks.request).toHaveBeenLastCalledWith(0, 20);

    await wrapper
      .get('tr[data-row-id="glossary-1"] button[data-row-action]')
      .trigger("click");
    expect(mocks.navigate).toHaveBeenCalledWith("/glossary/glossary-1");
  });
});
