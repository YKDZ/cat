import { createAuthedTestContext } from "@cat/test-utils";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import type { Context } from "@/utils/context";

const mocks = vi.hoisted(() => ({
  executeCommand: vi.fn(),
  executeQuery: vi.fn(),
  interceptWrite: vi.fn(),
  promoteApprovedTranslationMemoryOp: vi.fn(),
}));

vi.mock("@cat/operations", () => ({
  promoteApprovedTranslationMemoryOp: mocks.promoteApprovedTranslationMemoryOp,
}));

vi.mock("@cat/domain", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/domain")>("@cat/domain");

  return {
    ...actual,
    executeCommand: mocks.executeCommand,
    executeQuery: mocks.executeQuery,
  };
});

vi.mock("@cat/shared", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/shared")>("@cat/shared");
  return {
    ...actual,
    QaReviewActionResultSchema: { parse: (input: unknown) => input },
  };
});

vi.mock("@/utils/vcs-route-helper", async () => {
  const actual = await vi.importActual<typeof import("@/utils/vcs-route-helper")>(
    "@/utils/vcs-route-helper",
  );

  return {
    ...actual,
    createVCSRouteHelper: vi.fn(() => ({
      middleware: {
        interceptWrite: mocks.interceptWrite,
      },
    })),
  };
});

type ProcedureInternal = {
  handler: (options: {
    context: Context;
    input: unknown;
    errors: Record<string, never>;
    path: string[];
    signal: AbortSignal | undefined;
  }) => Promise<unknown>;
};

const getProcedureInternal = (procedure: unknown): ProcedureInternal => {
  if (typeof procedure !== "object" || procedure === null) {
    throw new TypeError("Expected an oRPC procedure object");
  }

  const internal = Reflect.get(procedure, "~orpc");
  if (typeof internal !== "object" || internal === null) {
    throw new TypeError("Expected oRPC internals on the procedure");
  }

  const handler = Reflect.get(internal, "handler");
  if (typeof handler !== "function") {
    throw new TypeError("Expected oRPC handler function");
  }

  return {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- narrow boundary for oRPC internals in unit tests
    handler: handler as ProcedureInternal["handler"],
  };
};

const invokeHandler = async (
  procedure: unknown,
  context: Context,
  input: unknown,
): Promise<unknown> => {
  const internal = getProcedureInternal(procedure);

  return await internal.handler({
    context,
    input,
    errors: {},
    path: [],
    signal: undefined,
  });
};

import {
  createChangeset,
  getFirstQaReviewableElement,
  listTranslationsByIds,
  submitQaReviewAction,
} from "@cat/domain";

import { submitAction } from "./qa-review";

const noop = (): undefined => undefined;

const createMockContext = (input: {
  projectId: string;
  branchId?: number | null;
  includeBranchContext?: boolean;
  branchChangesetId?: number;
}): Context => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- bounded test double for oRPC handler tests
  const fakeDbClient = {
    transaction: vi.fn(
      async (fn: (tx: unknown) => Promise<unknown>) => await fn({}),
    ),
  } as unknown as Context["drizzleDB"]["client"];

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- bounded test double for oRPC handler tests
  const fakeDrizzleDb = {
    client: fakeDbClient,
    connect: async () => {
      /* noop */
    },
    disconnect: async () => {
      /* noop */
    },
    ping: async () => {
      /* noop */
    },
    migrate: async () => undefined,
  } as Context["drizzleDB"];

  const baseContext = createAuthedTestContext(
    {
      id: "11111111-1111-4111-8111-111111111111",
      email: "qa-router@test.local",
      name: "QA Router Tester",
      emailVerified: true,
      avatarFileId: null,
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    },
    {
      drizzleDB: fakeDrizzleDb,
      helpers: {
        setCookie: noop,
        delCookie: noop,
        getCookie: (name) => (name === "csrfToken" ? "csrf-token" : null),
        getQueryParam: () => undefined,
        getReqHeader: (name) =>
          name === "x-csrf-token" ? "csrf-token" : undefined,
        setResHeader: noop,
      },
    },
  );

  const context: Context = {
    ...baseContext,
    auth: {
      subjectType: "user",
      subjectId: "11111111-1111-4111-8111-111111111111",
      systemRoles: [],
      scopes: null,
      traceId: undefined,
      ip: undefined,
      userAgent: undefined,
    },
    csrfToken: "csrf-token",
    isSSR: false,
    isWebSocket: false,
    requestSignal: new AbortController().signal,
  };

  if (input.includeBranchContext) {
    return {
      ...context,
      branchId: input.branchId ?? undefined,
      branchProjectId: input.projectId,
      branchChangesetId: input.branchChangesetId,
    };
  }

  return context;
};

const baseInput = {
  projectId: "22222222-2222-4222-8222-222222222222",
  languageId: "zh-Hans",
  branchId: null,
  elementId: 1996,
  translationId: 7001,
  queueItemId: 9001,
  action: "APPROVE" as const,
  expectedVersion: 3,
  noteBody: "Looks good",
  overrideBlocking: false,
  overrideReason: undefined,
  navigation: {
    afterElementId: 1996,
    pageSize: 16,
  },
};

describe("qaReview.submitAction handler", () => {
  beforeEach(() => {
    mocks.executeCommand.mockReset();
    mocks.executeQuery.mockReset();
    mocks.interceptWrite.mockReset();
    mocks.promoteApprovedTranslationMemoryOp.mockReset();
    mocks.promoteApprovedTranslationMemoryOp.mockResolvedValue({
      projectMemoryIds: ["33333333-3333-4333-8333-333333333333"],
      promotedMemoryItemIds: [42],
      noProjectMemoryTarget: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("updates main approval without writing branch overlay entries", async () => {
    mocks.executeCommand.mockResolvedValueOnce({
      decisionId: 101,
      annotationId: 102,
      queueItemId: 9001,
      queueStatus: "RESOLVED",
      approvedTranslationId: 7001,
      affectedSiblingQueueItemIds: [9002],
      branchApprovalOverlayMutations: [],
    });

    mocks.executeQuery.mockImplementationOnce(
      async (_ctx: unknown, query: unknown) => {
        if (query === getFirstQaReviewableElement) {
          return { elementId: 2001 };
        }
        return null;
      },
    );

    const output = await invokeHandler(
      submitAction,
      createMockContext({ projectId: baseInput.projectId }),
      baseInput,
    );

    expect(mocks.executeCommand).toHaveBeenCalledWith(
      { db: {} },
      submitQaReviewAction,
      expect.objectContaining({
        reviewerId: "11111111-1111-4111-8111-111111111111",
        branchId: null,
      }),
    );
    expect(mocks.interceptWrite).not.toHaveBeenCalled();
    expect(mocks.promoteApprovedTranslationMemoryOp).toHaveBeenCalledWith({
      translationId: 7001,
      approvedById: "11111111-1111-4111-8111-111111111111",
    });
    expect(output).toMatchObject({
      decisionId: 101,
      queueItemId: 9001,
      nextTarget: { kind: "element", elementId: 2001 },
    });
  });

  it("writes branch overlay entries on branch approval and keeps main approval untouched", async () => {
    mocks.executeCommand.mockResolvedValueOnce({
      decisionId: 201,
      annotationId: null,
      queueItemId: 9101,
      queueStatus: "RESOLVED",
      approvedTranslationId: 7101,
      affectedSiblingQueueItemIds: [9102],
      branchApprovalOverlayMutations: [
        { translationId: 7101, approved: true },
        { translationId: 7102, approved: false },
      ],
    });

    (mocks.executeQuery as Mock).mockImplementation(
      async (_ctx: unknown, query: unknown) => {
        if (query === listTranslationsByIds) {
          return [
            {
              translatableElementId: 1996,
              text: "Candidate",
              translatorId: "11111111-1111-4111-8111-111111111111",
              createdAt: new Date("2024-02-02T00:00:00.000Z"),
            },
          ];
        }
        if (query === getFirstQaReviewableElement) {
          return null;
        }
        return null;
      },
    );

    const output = await invokeHandler(
      submitAction,
      createMockContext({
        projectId: baseInput.projectId,
        branchId: 77,
        includeBranchContext: true,
        branchChangesetId: 123,
      }),
      {
        ...baseInput,
        branchId: 77,
      },
    );

    expect(mocks.interceptWrite).toHaveBeenCalledTimes(2);
    expect(mocks.promoteApprovedTranslationMemoryOp).not.toHaveBeenCalled();
    expect(mocks.interceptWrite).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        mode: "isolation",
        branchId: 77,
        branchChangesetId: 123,
      }),
      "translation",
      "7101",
      "UPDATE",
      expect.objectContaining({ approved: false }),
      expect.objectContaining({ approved: true }),
      expect.any(Function),
    );
    expect(output).toMatchObject({
      decisionId: 201,
      nextTarget: { kind: "empty" },
    });
  });

  it("creates a branch changeset lazily before writing QA approval overlays", async () => {
    mocks.executeCommand.mockImplementation(
      async (_ctx: unknown, command: unknown) => {
        if (command === submitQaReviewAction) {
          return {
            decisionId: 401,
            annotationId: null,
            queueItemId: 9301,
            queueStatus: "RESOLVED",
            approvedTranslationId: 7301,
            affectedSiblingQueueItemIds: [],
            branchApprovalOverlayMutations: [
              { translationId: 7301, approved: true },
            ],
          };
        }

        if (command === createChangeset) {
          return { id: 456 };
        }

        return null;
      },
    );

    (mocks.executeQuery as Mock).mockImplementation(
      async (_ctx: unknown, query: unknown) => {
        if (query === listTranslationsByIds) {
          return [
            {
              translatableElementId: 1996,
              text: "Candidate",
              translatorId: "11111111-1111-4111-8111-111111111111",
              createdAt: new Date("2024-02-02T00:00:00.000Z"),
            },
          ];
        }

        if (query === getFirstQaReviewableElement) {
          return null;
        }

        return null;
      },
    );

    await invokeHandler(
      submitAction,
      createMockContext({
        projectId: baseInput.projectId,
        branchId: 66,
        includeBranchContext: true,
      }),
      {
        ...baseInput,
        branchId: 66,
      },
    );

    expect(mocks.executeCommand).toHaveBeenNthCalledWith(
      2,
      { db: {} },
      createChangeset,
      {
        projectId: baseInput.projectId,
        branchId: 66,
        status: "PENDING",
      },
    );
    expect(mocks.interceptWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "isolation",
        branchId: 66,
        branchChangesetId: 456,
      }),
      "translation",
      "7301",
      "UPDATE",
      expect.objectContaining({ approved: false }),
      expect.objectContaining({ approved: true }),
      expect.any(Function),
    );
  });

  it("throws BAD_REQUEST when branch mode lacks branch context", async () => {
    mocks.executeCommand.mockResolvedValueOnce({
      decisionId: 301,
      annotationId: null,
      queueItemId: 9201,
      queueStatus: "RESOLVED",
      approvedTranslationId: 7201,
      affectedSiblingQueueItemIds: [],
      branchApprovalOverlayMutations: [{ translationId: 7201, approved: true }],
    });

    await expect(
      invokeHandler(
        submitAction,
        createMockContext({
          projectId: baseInput.projectId,
          branchId: 88,
          includeBranchContext: false,
        }),
        {
          ...baseInput,
          branchId: 88,
        },
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
