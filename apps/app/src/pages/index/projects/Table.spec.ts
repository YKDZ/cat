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
vi.mock("./Table.telefunc.ts", () => ({ onRequestProjects: mocks.request }));

import ProjectTable from "./Table.vue";

describe("Project table", () => {
  it("keeps project fetching and navigation outside the controlled DataTable", async () => {
    mocks.request.mockResolvedValue({
      data: [
        {
          createdAt: "2026-08-01T00:00:00.000Z",
          description: null,
          id: "project-1",
          name: "Project one",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      total: 21,
    });
    const wrapper = mount(ProjectTable);
    await flushPromises();

    expect(mocks.request).toHaveBeenCalledWith(0, 10);
    await wrapper.get('select[aria-label="每页条数"]').setValue("20");
    await flushPromises();
    expect(mocks.request).toHaveBeenLastCalledWith(0, 20);

    await wrapper
      .get('tr[data-row-id="project-1"] button[data-row-action]')
      .trigger("click");
    expect(mocks.navigate).toHaveBeenCalledWith("/project/project-1");
  });
});
