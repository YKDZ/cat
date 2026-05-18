import { beforeEach, describe, expect, it, vi } from "vitest";

const domainMocks = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  getDbHandle: vi.fn(),
  getBranchById: vi.fn(),
  listEditorScopeContentNodes: vi.fn(),
  listEditorScopeElements: vi.fn(),
  listElementsWithChunkIdsByIds: vi.fn(),
}));

vi.mock("@cat/domain", () => ({
  executeQuery: domainMocks.executeQuery,
  getDbHandle: domainMocks.getDbHandle,
  getBranchById: domainMocks.getBranchById,
  listEditorScopeContentNodes: domainMocks.listEditorScopeContentNodes,
  listEditorScopeElements: domainMocks.listEditorScopeElements,
  listElementsWithChunkIdsByIds: domainMocks.listElementsWithChunkIdsByIds,
}));

import {
  getBranchById,
  listEditorScopeContentNodes,
  listEditorScopeElements,
  listElementsWithChunkIdsByIds,
} from "@cat/domain";

import { resolveOperationScopeElementsOp } from "../resolve-operation-scope-elements";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const DIRECTORY_ID = "33333333-3333-4333-8333-333333333333";
const FILE_A_ID = "44444444-4444-4444-8444-444444444444";
const FILE_B_ID = "55555555-5555-4555-8555-555555555555";
const BRANCH_FILE_ID = "66666666-6666-4666-8666-666666666666";
const UNKNOWN_NODE_ID = "77777777-7777-4777-8777-777777777777";
const OTHER_PROJECT_NODE_ID = "88888888-8888-4888-8888-888888888888";
const BRANCH_ID = 9;
const OTHER_BRANCH_ID = 10;

const dbClient = { name: "mock-db" };

const scopeElements = [
  {
    id: 1,
    value: "Apple",
    languageId: "en",
    primaryContentNodeId: FILE_A_ID,
  },
  {
    id: 2,
    value: "Banana",
    languageId: "en",
    primaryContentNodeId: FILE_A_ID,
  },
  {
    id: 3,
    value: "Cherry",
    languageId: "en",
    primaryContentNodeId: FILE_B_ID,
  },
];

const detailRows = [
  {
    id: 1,
    projectId: PROJECT_ID,
    primaryContentNodeId: FILE_A_ID,
    value: "Apple",
    languageId: "en",
    chunkIds: [11, 12],
  },
  {
    id: 2,
    projectId: PROJECT_ID,
    primaryContentNodeId: FILE_A_ID,
    value: "Banana",
    languageId: "en",
    chunkIds: [21],
  },
  {
    id: 3,
    projectId: PROJECT_ID,
    primaryContentNodeId: FILE_B_ID,
    value: "Cherry",
    languageId: "en",
    chunkIds: [31, 32],
  },
  {
    id: 4,
    projectId: PROJECT_ID,
    primaryContentNodeId: BRANCH_FILE_ID,
    value: "Durian",
    languageId: "en",
    chunkIds: [41],
  },
  {
    id: 999,
    projectId: OTHER_PROJECT_ID,
    primaryContentNodeId: OTHER_PROJECT_NODE_ID,
    value: "Foreign",
    languageId: "en",
    chunkIds: [91],
  },
];

const paginate = <T>(items: T[], page: number, pageSize: number) => {
  const start = page * pageSize;
  return items.slice(start, start + pageSize);
};

type MockQueryInput = {
  branchId?: number;
  page?: number;
  pageSize?: number;
  elementIds?: number[];
};

const configureDomainMocks = ({
  branchProjectId,
  visibleNodeIds = [DIRECTORY_ID, FILE_A_ID, FILE_B_ID],
  resolvedScopeElements = scopeElements,
  resolvedDetails = detailRows,
}: {
  branchProjectId?: string;
  visibleNodeIds?: string[];
  resolvedScopeElements?: Array<{
    id: number;
    value: string;
    languageId: string;
    primaryContentNodeId: string | null;
  }>;
  resolvedDetails?: typeof detailRows;
} = {}) => {
  domainMocks.executeQuery.mockImplementation(
    async (_ctx, query, input: MockQueryInput) => {
      if (query === getBranchById) {
        if (branchProjectId === undefined) return null;
        return { id: input.branchId ?? BRANCH_ID, projectId: branchProjectId };
      }

      if (query === listEditorScopeContentNodes) {
        return visibleNodeIds.map((id) => ({ id }));
      }

      if (query === listEditorScopeElements) {
        return paginate(
          resolvedScopeElements,
          input.page ?? 0,
          input.pageSize ?? resolvedScopeElements.length,
        );
      }

      if (query === listElementsWithChunkIdsByIds) {
        return resolvedDetails.filter((detail) =>
          (input.elementIds ?? []).includes(detail.id),
        );
      }

      throw new Error(`Unexpected query mock: ${String(query)}`);
    },
  );
};

const countQueryCalls = (query: unknown) =>
  domainMocks.executeQuery.mock.calls.filter((call) => call[1] === query)
    .length;

describe("resolveOperationScopeElementsOp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    domainMocks.getDbHandle.mockResolvedValue({ client: dbClient });
    configureDomainMocks();
  });

  it("returns all project elements when contentNodeIds is empty", async () => {
    const result = await resolveOperationScopeElementsOp({
      projectId: PROJECT_ID,
      contentNodeIds: [],
      elementIds: [],
      languageToId: "zh-Hans",
      statusFilter: "all",
    });

    expect(result.elements.map((element) => element.id)).toEqual([1, 2, 3]);
    expect(result.elements.map((element) => element.chunkIds)).toEqual([
      [11, 12],
      [21],
      [31, 32],
    ]);
  });

  it("includes descendant file elements for a directory content node", async () => {
    const result = await resolveOperationScopeElementsOp({
      projectId: PROJECT_ID,
      contentNodeIds: [DIRECTORY_ID],
      elementIds: [],
      languageToId: "zh-Hans",
      statusFilter: "all",
    });

    expect(result.elements.map((element) => element.value)).toEqual([
      "Apple",
      "Banana",
      "Cherry",
    ]);
  });

  it("builds a multi-node union without duplicates", async () => {
    configureDomainMocks({
      resolvedScopeElements: [
        ...scopeElements,
        {
          id: 2,
          value: "Banana",
          languageId: "en",
          primaryContentNodeId: FILE_A_ID,
        },
      ],
    });

    const result = await resolveOperationScopeElementsOp({
      projectId: PROJECT_ID,
      contentNodeIds: [DIRECTORY_ID, FILE_A_ID],
      elementIds: [],
      languageToId: "zh-Hans",
      statusFilter: "all",
    });

    expect(result.elements.map((element) => element.id)).toEqual([1, 2, 3]);
  });

  it("rejects unknown content node ids", async () => {
    await expect(
      resolveOperationScopeElementsOp({
        projectId: PROJECT_ID,
        contentNodeIds: [UNKNOWN_NODE_ID],
        elementIds: [],
        languageToId: "zh-Hans",
        statusFilter: "all",
      }),
    ).rejects.toThrow(
      `Content node ${UNKNOWN_NODE_ID} is not visible in project ${PROJECT_ID}`,
    );

    expect(countQueryCalls(listEditorScopeElements)).toBe(0);
  });

  it("rejects content node ids from another project instead of returning empty results", async () => {
    await expect(
      resolveOperationScopeElementsOp({
        projectId: PROJECT_ID,
        contentNodeIds: [OTHER_PROJECT_NODE_ID],
        elementIds: [],
        languageToId: "zh-Hans",
        statusFilter: "all",
      }),
    ).rejects.toThrow(
      `Content node ${OTHER_PROJECT_NODE_ID} is not visible in project ${PROJECT_ID}`,
    );

    expect(countQueryCalls(listEditorScopeElements)).toBe(0);
  });

  it("rejects branch ids that belong to another project before resolving scope elements", async () => {
    configureDomainMocks({ branchProjectId: OTHER_PROJECT_ID });

    await expect(
      resolveOperationScopeElementsOp({
        projectId: PROJECT_ID,
        branchId: OTHER_BRANCH_ID,
        contentNodeIds: [],
        elementIds: [],
        languageToId: "zh-Hans",
        statusFilter: "all",
      }),
    ).rejects.toThrow(
      `Branch ${OTHER_BRANCH_ID} does not belong to project ${PROJECT_ID}`,
    );

    expect(countQueryCalls(listEditorScopeContentNodes)).toBe(0);
    expect(countQueryCalls(listEditorScopeElements)).toBe(0);
  });

  it("accepts branch-visible content nodes only when the branch belongs to the same project", async () => {
    configureDomainMocks({
      branchProjectId: PROJECT_ID,
      visibleNodeIds: [DIRECTORY_ID, FILE_A_ID, FILE_B_ID, BRANCH_FILE_ID],
      resolvedScopeElements: [
        {
          id: 4,
          value: "Durian",
          languageId: "en",
          primaryContentNodeId: BRANCH_FILE_ID,
        },
      ],
    });

    const result = await resolveOperationScopeElementsOp({
      projectId: PROJECT_ID,
      branchId: BRANCH_ID,
      contentNodeIds: [BRANCH_FILE_ID],
      elementIds: [],
      languageToId: "zh-Hans",
      statusFilter: "all",
    });

    expect(result.elements).toEqual([
      {
        id: 4,
        projectId: PROJECT_ID,
        primaryContentNodeId: BRANCH_FILE_ID,
        value: "Durian",
        languageId: "en",
        chunkIds: [41],
      },
    ]);
  });

  it("rejects direct element ids from another project instead of silently filtering them", async () => {
    configureDomainMocks({ resolvedScopeElements: [] });

    await expect(
      resolveOperationScopeElementsOp({
        projectId: PROJECT_ID,
        contentNodeIds: [],
        elementIds: [999],
        languageToId: "zh-Hans",
        statusFilter: "all",
      }),
    ).rejects.toThrow(`Element 999 does not belong to project ${PROJECT_ID}`);
  });

  it("loads element chunk details in one bulk query per resolver invocation", async () => {
    await resolveOperationScopeElementsOp({
      projectId: PROJECT_ID,
      contentNodeIds: [],
      elementIds: [],
      languageToId: "zh-Hans",
      statusFilter: "all",
    });

    expect(countQueryCalls(listElementsWithChunkIdsByIds)).toBe(1);
    expect(domainMocks.executeQuery).toHaveBeenCalledWith(
      { db: dbClient },
      listElementsWithChunkIdsByIds,
      { elementIds: [1, 2, 3] },
    );
  });
});
