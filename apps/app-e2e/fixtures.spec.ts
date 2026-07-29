import { describe, expect, it } from "vitest";

import {
  commitMainFrameDocumentNavigation,
  createNavigationTransaction,
  failMainFrameDocumentNavigation,
  recordMainFrameNavigationIntent,
  registerMainFrameDocument,
  navigationIdForDocumentEvent,
  navigationIdForRequestFailure,
  snapshotDocument,
  startMainFrameDocumentNavigation,
} from "./navigation-transaction.ts";
import {
  consumeControlledCancellation,
  consumeNavigationOwnedCancellationPageError,
  externalNetworkChangeUrl,
  isControlledCancellation,
  isExternalDynamicImportPageError,
  isExternalNetworkChange,
  isNavigationOwnedCancellationPageError,
  isReplacedNavigationAbort,
} from "./tests/fixtures.ts";

const requestFailure = (epoch: number, value: string) => ({
  documentUrl: "http://localhost/project/one",
  epoch,
  occurredAt: 5_000,
  kind: "critical-resource" as const,
  source: "request" as const,
  value,
});

const pageError = (value: string) => ({
  documentUrl: "http://localhost/project/one",
  epoch: 3,
  errorName: "TypeError",
  kind: "page-error" as const,
  occurredAt: 5_000,
  source: "page" as const,
  value,
});

describe("browser diagnostics request failures", () => {
  it("accepts only application-corroborated same-document fetch cancellations", () => {
    const failure = {
      ...requestFailure(
        3,
        "fetch http://localhost/api/rpc/ghostText/suggest: net::ERR_ABORTED",
      ),
      documentUrl: "http://localhost/editor/project/one/zh-Hans/1",
      requestId: "cancel-1",
    };
    const cancellation = {
      documentUrl: "http://localhost/editor/project/one/zh-Hans/1",
      expected: true as const,
      id: "cancel-1",
      kind: "navigation" as const,
      time: 4_500,
      url: "/api/rpc/ghostText/suggest",
      version: 1 as const,
    };

    expect(isControlledCancellation(failure, cancellation)).toBe(true);
    expect(
      isControlledCancellation(
        {
          ...failure,
          value:
            "fetch http://localhost/api/rpc/ghostText/suggest: NS_BINDING_ABORTED",
        },
        cancellation,
      ),
    ).toBe(true);
    expect(
      isControlledCancellation(failure, {
        ...cancellation,
        id: "cancel-2",
        url: "/api/rpc/memory/onNew",
      }),
    ).toBe(false);
    expect(
      isControlledCancellation(failure, { ...cancellation, expected: false }),
    ).toBe(false);
  });

  it("accepts only an exact consumer cancellation request ID", () => {
    const failure = {
      ...requestFailure(
        3,
        "fetch http://localhost/api/rpc/memory/onNew: net::ERR_ABORTED",
      ),
      documentUrl: "http://localhost/editor/project/one/zh-Hans/1",
      requestId: "consumer-1",
    };
    const cancellation = {
      documentUrl: failure.documentUrl,
      expected: true as const,
      id: "consumer-1",
      kind: "consumer" as const,
      time: 4_500,
      url: "/api/rpc/memory/onNew",
      version: 1 as const,
    };

    expect(isControlledCancellation(failure, cancellation)).toBe(true);
    expect(
      isControlledCancellation(
        { ...failure, requestId: "other" },
        cancellation,
      ),
    ).toBe(false);
  });

  it("consumes each controlled cancellation occurrence only once", () => {
    const cancellation = {
      documentToken: "source-document",
      documentUrl: "http://localhost/project/one",
      expected: true as const,
      id: "cancel-1",
      kind: "signal" as const,
      recordId: "cancellation-1",
      time: 4_500,
      url: "/api/rpc/ghostText/suggest",
      version: 1 as const,
    };
    const failure = {
      ...requestFailure(
        3,
        "fetch http://localhost/api/rpc/ghostText/suggest: net::ERR_ABORTED",
      ),
      documentToken: "source-document",
      requestId: "cancel-1",
    };
    const consumed = new Set<string>();

    expect(
      consumeControlledCancellation(failure, [cancellation], consumed),
    ).toBe(true);
    expect(
      consumeControlledCancellation(failure, [cancellation], consumed),
    ).toBe(false);
  });

  it("keeps active, wrong-ID, missing-ID, and settled request failures fatal", () => {
    const cancellation = {
      documentUrl: "http://localhost/editor/project/one/zh-Hans/1",
      expected: true as const,
      id: "cancel-1",
      kind: "signal" as const,
      time: 5_000,
      url: "http://localhost/api/rpc/ghostText/suggest",
      version: 1 as const,
    };
    const failedRequest = {
      ...requestFailure(
        3,
        "fetch http://localhost/api/rpc/ghostText/suggest: net::ERR_FAILED",
      ),
      documentUrl: cancellation.documentUrl,
      occurredAt: cancellation.time,
    };

    expect(isControlledCancellation(failedRequest, cancellation)).toBe(false);
    expect(
      isControlledCancellation(
        { ...failedRequest, requestId: "wrong-request-id" },
        cancellation,
      ),
    ).toBe(false);
    expect(
      isControlledCancellation(
        { ...failedRequest, requestId: "settled-request-id" },
        cancellation,
      ),
    ).toBe(false);
  });

  it("never treats scripts, websocket failures, or application errors as cancellations", () => {
    const cancellation = {
      documentUrl: "http://localhost/editor/project/one/zh-Hans/1",
      expected: true as const,
      id: "cancel-1",
      kind: "navigation" as const,
      time: 5_000,
      url: "http://localhost/app.js",
      version: 1 as const,
    };
    for (const failure of [
      {
        ...requestFailure(
          3,
          "script http://localhost/app.js: net::ERR_ABORTED",
        ),
        requestId: cancellation.id,
      },
      {
        documentUrl: "http://localhost/project/one",
        epoch: 3,
        occurredAt: 5_000,
        kind: "websocket" as const,
        source: "websocket" as const,
        value: "ws://localhost/api/ws: closed",
      },
      {
        documentUrl: "http://localhost/project/one",
        epoch: 3,
        occurredAt: 5_000,
        kind: "app-error" as const,
        source: "browser-event" as const,
        value: "CAT_ERROR: failure",
      },
    ]) {
      expect(isControlledCancellation(failure, cancellation)).toBe(false);
    }
  });

  it("classifies browser network-change resource failures as external", () => {
    const chunkFailure = {
      ...requestFailure(
        3,
        "script http://localhost/assets/chunk.js: net::ERR_NETWORK_CHANGED",
      ),
    };
    expect(isExternalNetworkChange(chunkFailure)).toBe(true);
    expect(externalNetworkChangeUrl(chunkFailure)).toBe(
      "http://localhost/assets/chunk.js",
    );
    expect(
      isExternalNetworkChange({
        documentUrl: "http://localhost/project/one",
        epoch: 3,
        kind: "framework-warning",
        occurredAt: 5_000,
        source: "console",
        value:
          "Unstructured console.error: Failed to load resource: net::ERR_NETWORK_CHANGED",
      }),
    ).toBe(true);
    expect(
      isExternalNetworkChange({
        ...requestFailure(
          3,
          "script http://localhost/assets/chunk.js: net::ERR_FAILED",
        ),
      }),
    ).toBe(false);
    expect(
      isExternalNetworkChange({
        documentUrl: "http://localhost/project/one",
        epoch: 3,
        kind: "app-error",
        occurredAt: 5_000,
        source: "browser-event",
        value: "CAT_ERROR: failure",
      }),
    ).toBe(false);
  });

  it("consumes dynamic import page errors only with network-change evidence", () => {
    const dynamicImportFailure = pageError(
      "Failed to fetch dynamically imported module: http://127.0.0.1:43955/assets/entries/src_pages_qa-review_project_-projectId_-languageToId_-elementId.CF_Cj78s.js",
    );
    const exactUrls = new Set([
      "http://127.0.0.1:43955/assets/entries/src_pages_qa-review_project_-projectId_-languageToId_-elementId.CF_Cj78s.js",
    ]);

    expect(
      isExternalDynamicImportPageError(dynamicImportFailure, exactUrls, true),
    ).toBe(true);
    expect(
      isExternalDynamicImportPageError(
        dynamicImportFailure,
        new Set<string>(),
        true,
      ),
    ).toBe(true);
    expect(
      isExternalDynamicImportPageError(
        dynamicImportFailure,
        new Set<string>(),
        false,
      ),
    ).toBe(false);
    expect(
      isExternalDynamicImportPageError(
        pageError(
          "Failed to fetch dynamically imported module: /assets/app.js",
        ),
        exactUrls,
        true,
      ),
    ).toBe(false);
    expect(
      isExternalDynamicImportPageError(
        pageError("Application chunk loader invariant failed"),
        exactUrls,
        true,
      ),
    ).toBe(false);
  });
});

describe("browser diagnostics navigation transaction", () => {
  it("binds a Firefox cancellation intent to the document request that starts after it", () => {
    const navigationRequest = {};
    let transaction = createNavigationTransaction();
    transaction = registerMainFrameDocument(transaction, "source-document");
    transaction = recordMainFrameNavigationIntent(
      transaction,
      "navigation-intent",
      "source-document",
      1,
    );
    transaction = startMainFrameDocumentNavigation(
      transaction,
      navigationRequest,
      1_000,
    );
    const navigationTransactionId = navigationIdForDocumentEvent(
      transaction,
      "navigation-intent",
    );
    transaction = commitMainFrameDocumentNavigation(transaction, 1_010);

    expect(navigationTransactionId).toBeDefined();
    expect(
      navigationTransactionId === undefined
        ? false
        : transaction.committedNavigationIds.has(navigationTransactionId),
    ).toBe(true);
  });

  it("binds an intent that arrives after a request and its commit", () => {
    const navigationRequest = {};
    let transaction = createNavigationTransaction();
    transaction = registerMainFrameDocument(transaction, "source-document");
    transaction = startMainFrameDocumentNavigation(
      transaction,
      navigationRequest,
      1_000,
    );
    transaction = commitMainFrameDocumentNavigation(transaction, 1_010);
    transaction = recordMainFrameNavigationIntent(
      transaction,
      "late-navigation-intent",
      "source-document",
      1,
    );
    const navigationTransactionId = navigationIdForDocumentEvent(
      transaction,
      "late-navigation-intent",
    );

    expect(navigationTransactionId).toBeDefined();
    expect(
      navigationTransactionId === undefined
        ? false
        : transaction.committedNavigationIds.has(navigationTransactionId),
    ).toBe(true);
  });

  it("does not let a failed navigation's late intent bind its next request", () => {
    const failedNavigationRequest = {};
    const committedNavigationRequest = {};
    let transaction = createNavigationTransaction();
    transaction = registerMainFrameDocument(transaction, "source-document");
    transaction = startMainFrameDocumentNavigation(
      transaction,
      failedNavigationRequest,
      1_000,
    );
    transaction = failMainFrameDocumentNavigation(
      transaction,
      failedNavigationRequest,
      1_010,
    );
    transaction = recordMainFrameNavigationIntent(
      transaction,
      "failed-navigation-intent",
      "source-document",
      1,
    );
    transaction = startMainFrameDocumentNavigation(
      transaction,
      committedNavigationRequest,
      1_020,
    );
    transaction = commitMainFrameDocumentNavigation(transaction, 1_030);

    expect(
      navigationIdForDocumentEvent(transaction, "failed-navigation-intent"),
    ).toBe(1);
    expect(transaction.committedNavigationIds.has(1)).toBe(false);
  });

  it("binds an intent that occurs during its pending request", () => {
    const navigationRequest = {};
    let transaction = createNavigationTransaction();
    transaction = registerMainFrameDocument(transaction, "source-document");
    transaction = startMainFrameDocumentNavigation(
      transaction,
      navigationRequest,
      1_000,
    );
    transaction = recordMainFrameNavigationIntent(
      transaction,
      "pending-navigation-intent",
      "source-document",
      1,
    );
    transaction = commitMainFrameDocumentNavigation(transaction, 1_010);

    expect(
      navigationIdForDocumentEvent(transaction, "pending-navigation-intent"),
    ).toBe(1);
  });

  it("queues an intent that occurs after a failed request for the next request", () => {
    const failedNavigationRequest = {};
    const nextNavigationRequest = {};
    let transaction = createNavigationTransaction();
    transaction = registerMainFrameDocument(transaction, "source-document");
    transaction = startMainFrameDocumentNavigation(
      transaction,
      failedNavigationRequest,
      1_000,
    );
    transaction = failMainFrameDocumentNavigation(
      transaction,
      failedNavigationRequest,
      1_010,
    );
    transaction = recordMainFrameNavigationIntent(
      transaction,
      "next-navigation-intent",
      "source-document",
      1,
    );
    transaction = startMainFrameDocumentNavigation(
      transaction,
      nextNavigationRequest,
      1_020,
    );

    expect(
      navigationIdForDocumentEvent(transaction, "next-navigation-intent"),
    ).toBe(1);
  });

  it("deduplicates beforeunload and pagehide reports for one intent token", () => {
    const navigationRequest = {};
    let transaction = createNavigationTransaction();
    transaction = registerMainFrameDocument(transaction, "source-document");
    transaction = recordMainFrameNavigationIntent(
      transaction,
      "single-navigation-intent",
      "source-document",
      1,
    );
    transaction = recordMainFrameNavigationIntent(
      transaction,
      "single-navigation-intent",
      "source-document",
      1,
    );
    transaction = startMainFrameDocumentNavigation(
      transaction,
      navigationRequest,
    );

    expect(transaction.pendingNavigationIntents.size).toBe(0);
    expect(
      navigationIdForDocumentEvent(transaction, "single-navigation-intent"),
    ).toBe(1);
  });

  it("re-registers a BFCache document as the source of its next navigation", () => {
    const firstRequest = {};
    const resumedRequest = {};
    let transaction = createNavigationTransaction();
    transaction = registerMainFrameDocument(transaction, "bfcache-document");
    transaction = recordMainFrameNavigationIntent(
      transaction,
      "before-restore-navigation-intent",
      "bfcache-document",
      1,
    );
    transaction = startMainFrameDocumentNavigation(
      transaction,
      firstRequest,
      1_000,
    );
    transaction = commitMainFrameDocumentNavigation(transaction, 1_010);
    transaction = registerMainFrameDocument(
      transaction,
      "replacement-document",
    );
    transaction = startMainFrameDocumentNavigation(
      transaction,
      resumedRequest,
      1_020,
    );
    transaction = commitMainFrameDocumentNavigation(transaction, 1_030);
    transaction = registerMainFrameDocument(transaction, "bfcache-document");
    transaction = recordMainFrameNavigationIntent(
      transaction,
      "resumed-navigation-intent",
      "bfcache-document",
      1,
    );
    transaction = startMainFrameDocumentNavigation(transaction, {}, 1_050);

    expect(
      navigationIdForDocumentEvent(transaction, "resumed-navigation-intent"),
    ).toBe(3);
    expect(transaction.documentGenerations.get("bfcache-document")).toBe(2);
  });

  it("allows only an exact expected cancellation error owned by a committed navigation", () => {
    const navigationRequest = {};
    let transaction = createNavigationTransaction();
    const sourceDocument = snapshotDocument(
      transaction,
      "http://localhost/editor/project/one?branchId=1",
    );
    transaction = registerMainFrameDocument(transaction, "old-document");
    transaction = recordMainFrameNavigationIntent(
      transaction,
      "failed-navigation-intent",
      "old-document",
      1,
    );
    transaction = startMainFrameDocumentNavigation(
      transaction,
      navigationRequest,
    );
    const navigationTransactionId = navigationIdForRequestFailure(
      transaction,
      navigationRequest,
    );
    if (navigationTransactionId === undefined)
      throw new Error("Expected pending navigation transaction");
    transaction = commitMainFrameDocumentNavigation(transaction);

    const failure = {
      documentUrl: sourceDocument.url,
      epoch: sourceDocument.epoch,
      occurredAt: 5_001,
      errorName: "ExpectedRequestCancellationError" as const,
      kind: "page-error" as const,
      navigationTransactionId,
      source: "page" as const,
      value: "CAT request was cancelled",
    };
    const cancellation = {
      documentToken: "old-document",
      documentUrl: sourceDocument.url,
      errorName: "ExpectedRequestCancellationError" as const,
      expected: true as const,
      id: "navigation-request",
      kind: "navigation" as const,
      navigationTransactionId,
      recordId: "cancel-error-1",
      time: 5_000,
      url: "http://localhost/api/rpc/translation/onCreate",
      version: 1 as const,
    };

    expect(
      isNavigationOwnedCancellationPageError(
        failure,
        cancellation,
        transaction.committedNavigationIds,
      ),
    ).toBe(true);
    expect(
      isNavigationOwnedCancellationPageError(
        { ...failure, errorName: "Error" },
        cancellation,
        transaction.committedNavigationIds,
      ),
    ).toBe(false);
    expect(
      isNavigationOwnedCancellationPageError(
        failure,
        { ...cancellation, kind: "signal" },
        transaction.committedNavigationIds,
      ),
    ).toBe(false);
    expect(
      isNavigationOwnedCancellationPageError(
        failure,
        { ...cancellation, navigationTransactionId: 999 },
        transaction.committedNavigationIds,
      ),
    ).toBe(false);
    expect(
      isNavigationOwnedCancellationPageError(failure, cancellation, new Set()),
    ).toBe(false);

    const consumedCancellationRecordIds = new Set<string>();
    expect(
      consumeNavigationOwnedCancellationPageError(
        failure,
        cancellation,
        transaction.committedNavigationIds,
        consumedCancellationRecordIds,
      ),
    ).toBe(true);
    expect(
      consumeNavigationOwnedCancellationPageError(
        { ...failure, occurredAt: 5_002 },
        cancellation,
        transaction.committedNavigationIds,
        consumedCancellationRecordIds,
      ),
    ).toBe(false);
  });

  it("keeps a stored cancellation bound to its original same-URL navigation epoch", () => {
    const failedNavigationRequest = {};
    const committedNavigationRequest = {};
    let transaction = createNavigationTransaction();
    transaction = registerMainFrameDocument(transaction, "old-document");
    transaction = recordMainFrameNavigationIntent(
      transaction,
      "failed-navigation-intent",
      "old-document",
      1,
    );
    transaction = startMainFrameDocumentNavigation(
      transaction,
      failedNavigationRequest,
      1_000,
    );
    const failedNavigationId = navigationIdForDocumentEvent(
      transaction,
      "failed-navigation-intent",
    );
    transaction = failMainFrameDocumentNavigation(
      transaction,
      failedNavigationRequest,
      1_010,
    );
    transaction = recordMainFrameNavigationIntent(
      transaction,
      "committed-navigation-intent",
      "old-document",
      2,
    );
    transaction = startMainFrameDocumentNavigation(
      transaction,
      committedNavigationRequest,
      1_020,
    );
    transaction = commitMainFrameDocumentNavigation(transaction, 1_030);

    expect(
      navigationIdForDocumentEvent(transaction, "failed-navigation-intent"),
    ).toBe(failedNavigationId);
    expect(
      navigationIdForDocumentEvent(transaction, "committed-navigation-intent"),
    ).not.toBe(failedNavigationId);
    expect(
      failedNavigationId === undefined
        ? false
        : transaction.committedNavigationIds.has(failedNavigationId),
    ).toBe(false);

    if (failedNavigationId === undefined)
      throw new Error("Expected failed navigation intent to bind");
    const failedCancellation = {
      documentToken: "old-document",
      documentUrl: "http://localhost/editor/project/one",
      errorName: "ExpectedRequestCancellationError" as const,
      expected: true as const,
      id: "navigation-request",
      kind: "navigation" as const,
      navigationTransactionId: failedNavigationId,
      recordId: "failed-cancellation-error",
      time: 995,
      url: "http://localhost/api/rpc/translation/onCreate",
      version: 1 as const,
    };
    const failedPageError = {
      documentToken: "old-document",
      documentUrl: "http://localhost/editor/project/one",
      epoch: 0,
      errorName: "ExpectedRequestCancellationError" as const,
      kind: "page-error" as const,
      navigationTransactionId: failedNavigationId,
      occurredAt: 1_001,
      source: "page" as const,
      value: "CAT request was cancelled",
    };

    expect(
      isNavigationOwnedCancellationPageError(
        failedPageError,
        failedCancellation,
        transaction.committedNavigationIds,
      ),
    ).toBe(false);
    expect(
      isNavigationOwnedCancellationPageError(
        { ...failedPageError, navigationTransactionId: 2 },
        failedCancellation,
        transaction.committedNavigationIds,
      ),
    ).toBe(false);
  });

  it("does not consume a late cancellation error from a failed navigation as the next committed navigation", () => {
    const failedNavigationRequest = {};
    const committedNavigationRequest = {};
    let transaction = registerMainFrameDocument(
      createNavigationTransaction(),
      "old-document",
    );
    transaction = recordMainFrameNavigationIntent(
      transaction,
      "failed-navigation-intent",
      "old-document",
      1,
    );
    transaction = startMainFrameDocumentNavigation(
      transaction,
      failedNavigationRequest,
    );
    const failedNavigationId = navigationIdForDocumentEvent(
      transaction,
      "failed-navigation-intent",
    );
    transaction = failMainFrameDocumentNavigation(
      transaction,
      failedNavigationRequest,
    );
    transaction = recordMainFrameNavigationIntent(
      transaction,
      "committed-navigation-intent",
      "old-document",
      2,
    );
    transaction = startMainFrameDocumentNavigation(
      transaction,
      committedNavigationRequest,
    );
    transaction = commitMainFrameDocumentNavigation(transaction);
    const committedNavigationId = navigationIdForDocumentEvent(
      transaction,
      "committed-navigation-intent",
    );
    if (
      failedNavigationId === undefined ||
      committedNavigationId === undefined
    ) {
      throw new Error("Expected both navigation intents to bind");
    }

    const lateError = {
      documentToken: "old-document",
      documentUrl: "http://localhost/editor/project/one",
      epoch: 0,
      errorName: "ExpectedRequestCancellationError" as const,
      kind: "page-error" as const,
      navigationTransactionId: failedNavigationId,
      occurredAt: 1_040,
      source: "page" as const,
      value: "CAT request was cancelled",
    };
    const frozenCancellation = {
      documentToken: "old-document",
      documentUrl: lateError.documentUrl,
      errorName: "ExpectedRequestCancellationError" as const,
      expected: true as const,
      id: "cancelled-navigation-request",
      kind: "navigation" as const,
      navigationTransactionId: failedNavigationId,
      recordId: "cancel-error-from-intent-1",
      time: 1_000,
      url: "http://localhost/api/rpc/translation/onCreate",
      version: 1 as const,
    };

    expect(
      isNavigationOwnedCancellationPageError(
        lateError,
        frozenCancellation,
        transaction.committedNavigationIds,
      ),
    ).toBe(false);
    expect(
      isNavigationOwnedCancellationPageError(
        { ...lateError, navigationTransactionId: committedNavigationId },
        {
          ...frozenCancellation,
          navigationTransactionId: committedNavigationId,
        },
        transaction.committedNavigationIds,
      ),
    ).toBe(true);
  });

  it("does not assign a page error from another document epoch to a pending navigation", () => {
    const navigationRequest = {};
    let transaction = createNavigationTransaction();
    transaction = startMainFrameDocumentNavigation(
      transaction,
      navigationRequest,
      1_000,
    );

    expect(
      navigationIdForDocumentEvent(transaction, "other-document-intent"),
    ).toBeUndefined();
    expect(navigationIdForRequestFailure(transaction, 1)).toBeUndefined();
  });

  it("allows Firefox's old fetch abort after the replacement commits", () => {
    const navigationRequest = {};
    let transaction = createNavigationTransaction();
    const oldDocument = snapshotDocument(transaction, "http://localhost/old");
    transaction = startMainFrameDocumentNavigation(
      transaction,
      navigationRequest,
    );

    // Firefox can report this before the subsequent main-frame commit.
    const oldFetchAbort = requestFailure(
      oldDocument.epoch,
      "fetch http://localhost/api/rpc/ghostText/suggest: NS_BINDING_ABORTED",
    );
    transaction = commitMainFrameDocumentNavigation(transaction);
    const navigationTransactionId = navigationIdForRequestFailure(
      transaction,
      oldDocument.epoch,
    );

    expect(transaction.documentEpoch).toBe(1);
    expect(
      isReplacedNavigationAbort(
        {
          ...oldFetchAbort,
          ...(navigationTransactionId === undefined
            ? {}
            : { navigationTransactionId }),
        },
        transaction.committedNavigationIds,
      ),
    ).toBe(true);
  });

  it("allows a replaced document's late subresource abort after its commit", () => {
    const navigationRequest = {};
    let transaction = createNavigationTransaction();
    const oldDocument = snapshotDocument(transaction, "http://localhost/old");
    transaction = startMainFrameDocumentNavigation(
      transaction,
      navigationRequest,
    );
    transaction = commitMainFrameDocumentNavigation(transaction);
    const navigationTransactionId = navigationIdForRequestFailure(
      transaction,
      oldDocument.epoch,
    );

    expect(
      isReplacedNavigationAbort(
        {
          ...requestFailure(
            oldDocument.epoch,
            "script http://localhost/assets/old-page.js: net::ERR_ABORTED",
          ),
          ...(navigationTransactionId === undefined
            ? {}
            : { navigationTransactionId }),
        },
        transaction.committedNavigationIds,
      ),
    ).toBe(true);
  });

  it("keeps a failed navigation and its old document request failures fatal", () => {
    const navigationRequest = {};
    let transaction = createNavigationTransaction();
    const oldDocument = snapshotDocument(transaction, "http://localhost/old");
    transaction = startMainFrameDocumentNavigation(
      transaction,
      navigationRequest,
    );
    transaction = failMainFrameDocumentNavigation(
      transaction,
      navigationRequest,
    );
    transaction = commitMainFrameDocumentNavigation(transaction);

    expect(transaction.documentEpoch).toBe(0);
    expect(
      isReplacedNavigationAbort(
        {
          ...requestFailure(
            oldDocument.epoch,
            "fetch http://localhost/api/rpc/ghostText/suggest: NS_BINDING_ABORTED",
          ),
        },
        transaction.committedNavigationIds,
      ),
    ).toBe(false);
  });

  it("does not let an unrelated later commit suppress a failed navigation's request", () => {
    const failedNavigationRequest = {};
    const committedNavigationRequest = {};
    let transaction = createNavigationTransaction();
    transaction = startMainFrameDocumentNavigation(
      transaction,
      failedNavigationRequest,
    );
    const failedTransactionId = navigationIdForRequestFailure(transaction, 0);
    transaction = failMainFrameDocumentNavigation(
      transaction,
      failedNavigationRequest,
    );
    transaction = startMainFrameDocumentNavigation(
      transaction,
      committedNavigationRequest,
    );
    transaction = commitMainFrameDocumentNavigation(transaction);

    expect(
      isReplacedNavigationAbort(
        {
          ...requestFailure(
            0,
            "fetch http://localhost/api/rpc/ghostText/suggest: NS_BINDING_ABORTED",
          ),
          ...(failedTransactionId === undefined
            ? {}
            : { navigationTransactionId: failedTransactionId }),
        },
        transaction.committedNavigationIds,
      ),
    ).toBe(false);
  });

  it("does not associate a failure that happens before a later navigation starts", () => {
    const committedNavigationRequest = {};
    let transaction = createNavigationTransaction();
    const unassociatedFailureId = navigationIdForRequestFailure(transaction, 0);
    transaction = startMainFrameDocumentNavigation(
      transaction,
      committedNavigationRequest,
    );
    transaction = commitMainFrameDocumentNavigation(transaction);

    expect(
      isReplacedNavigationAbort(
        {
          ...requestFailure(
            0,
            "fetch http://localhost/api/rpc/ghostText/suggest: NS_BINDING_ABORTED",
          ),
          ...(unassociatedFailureId === undefined
            ? {}
            : { navigationTransactionId: unassociatedFailureId }),
        },
        transaction.committedNavigationIds,
      ),
    ).toBe(false);
  });

  it("does not replace an epoch for same-document navigation", () => {
    const transaction = commitMainFrameDocumentNavigation(
      createNavigationTransaction(),
    );

    expect(transaction.documentEpoch).toBe(0);
    expect(
      isReplacedNavigationAbort(
        requestFailure(
          0,
          "fetch http://localhost/api/rpc/ghostText/suggest: NS_BINDING_ABORTED",
        ),
        transaction.committedNavigationIds,
      ),
    ).toBe(false);
  });

  it("never suppresses old-epoch non-request diagnostics", () => {
    const navigationRequest = {};
    let transaction = createNavigationTransaction();
    transaction = startMainFrameDocumentNavigation(
      transaction,
      navigationRequest,
    );
    transaction = commitMainFrameDocumentNavigation(transaction);

    for (const failure of [
      {
        documentUrl: "http://localhost/old",
        epoch: 0,
        occurredAt: 5_000,
        kind: "websocket" as const,
        source: "websocket" as const,
        value: "ws://localhost/api/ws: closed",
      },
      {
        documentUrl: "http://localhost/old",
        epoch: 0,
        occurredAt: 5_000,
        kind: "framework-warning" as const,
        source: "console" as const,
        value: "Unstructured console.error: failure",
      },
      {
        documentUrl: "http://localhost/old",
        epoch: 0,
        occurredAt: 5_000,
        kind: "app-error" as const,
        source: "browser-event" as const,
        value: "CAT_ERROR: failure",
      },
    ]) {
      expect(
        isReplacedNavigationAbort(failure, transaction.committedNavigationIds),
      ).toBe(false);
    }
  });
});
