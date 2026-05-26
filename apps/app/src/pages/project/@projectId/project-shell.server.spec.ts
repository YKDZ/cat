import type { PageContextServer } from "vike/types";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectGet: vi.fn(),
  getTargetLanguages: vi.fn(),
  listContentNodes: vi.fn(),
}));

vi.mock("@/server/ssc", () => ({
  ssc: vi.fn(() => ({
    project: {
      get: mocks.projectGet,
      getTargetLanguages: mocks.getTargetLanguages,
      listContentNodes: mocks.listContentNodes,
    },
  })),
}));

import { render } from "vike/abort";

import { loadProjectShell, withProjectShell } from "./project-shell.server";

const makeCtx = (projectId: string) =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  ({ routeParams: { projectId } }) as unknown as PageContextServer;

describe("project shell server data", () => {
  beforeEach(() => {
    mocks.projectGet.mockReset();
    mocks.getTargetLanguages.mockReset();
    mocks.listContentNodes.mockReset();
    mocks.projectGet.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Demo",
      creatorId: "22222222-2222-4222-8222-222222222222",
      features: { issues: true, pullRequests: true },
    });
    mocks.getTargetLanguages.mockResolvedValue([{ id: "zh-Hans" }]);
    mocks.listContentNodes.mockResolvedValue([{ id: "node-1" }]);
  });

  it("loads project, target languages, and content nodes from route projectId", async () => {
    const shell = await loadProjectShell(
      makeCtx("11111111-1111-4111-8111-111111111111"),
    );

    expect(shell.project.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(shell.targetLanguages).toEqual([{ id: "zh-Hans" }]);
    expect(shell.contentNodes).toEqual([{ id: "node-1" }]);
  });

  it("keeps page data beside projectShell without replacing page fields", async () => {
    const result = await withProjectShell(
      makeCtx("11111111-1111-4111-8111-111111111111"),
      { projectId: "page-project", pullRequests: [{ id: 1 }] },
    );

    expect(result.projectId).toBe("page-project");
    expect(result.pullRequests).toEqual([{ id: 1 }]);
    expect(result.projectShell.project.name).toBe("Demo");
  });

  it("does not allow child page data to override projectShell", async () => {
    const result = await withProjectShell<{
      projectId: string;
      projectShell: {
        project: {
          name: string;
        };
      };
    }>(makeCtx("11111111-1111-4111-8111-111111111111"), {
      projectId: "page-project",
      projectShell: {
        project: { name: "Wrong" },
      },
    });

    expect(result.projectId).toBe("page-project");
    expect(result.projectShell.project.name).toBe("Demo");
  });

  it("keeps projectShell when recoverable child page data fails", async () => {
    const result = await withProjectShell<Record<string, unknown>>(
      makeCtx("11111111-1111-4111-8111-111111111111"),
      async () => {
        throw new Error("PR list failed");
      },
    );

    expect(result.projectShell.project.name).toBe("Demo");
    expect(result.pageError).toEqual({ message: "PR list failed" });
  });

  it("rethrows Vike route aborts instead of rendering them as pageError", async () => {
    await expect(
      withProjectShell(
        makeCtx("11111111-1111-4111-8111-111111111111"),
        async () => {
          throw render(
            "/project/11111111-1111-4111-8111-111111111111/issues",
            "Issue not found",
          );
        },
      ),
    ).rejects.toMatchObject({
      _pageContextAbort: expect.any(Object),
    });
  });
});
