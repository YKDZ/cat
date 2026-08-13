import { describe, expect, it } from "vitest";

import {
  cancelMainFrameNavigationIntent,
  commitMainFrameDocumentNavigation,
  createNavigationTransaction,
  failMainFrameDocumentNavigation,
  navigationIdForDocumentEvent,
  navigationIdForRequestFailure,
  recordMainFrameNavigationIntent,
  registerMainFrameDocument,
  startMainFrameDocumentNavigation,
} from "./navigation-transaction.ts";

describe("main-frame navigation attempts", () => {
  it("does not increment a lifetime when the same document registers again", () => {
    let transaction = registerMainFrameDocument(
      createNavigationTransaction(),
      "initial-document",
      "initial-lifetime",
    );
    transaction = registerMainFrameDocument(
      transaction,
      "initial-document",
      "initial-lifetime",
    );

    expect(transaction.documentGenerations.get("initial-document")).toBe(1);
    expect(
      transaction.documentLifetimeGenerations.get("initial-lifetime"),
    ).toBe(1);
  });

  it("rejects an old stored intent replayed after a BFCache lifetime is restored", () => {
    let transaction = registerMainFrameDocument(
      createNavigationTransaction(),
      "A",
      "A-lifetime-1",
    );
    transaction = recordMainFrameNavigationIntent(
      transaction,
      "A-old-intent",
      "A",
      1,
      "A-lifetime-1",
    );
    transaction = startMainFrameDocumentNavigation(transaction, {});
    transaction = commitMainFrameDocumentNavigation(transaction, 1);
    transaction = registerMainFrameDocument(transaction, "B", "B-lifetime-1");
    transaction = registerMainFrameDocument(transaction, "A", "A-lifetime-2");
    transaction = recordMainFrameNavigationIntent(
      transaction,
      "A-current-intent",
      "A",
      1,
      "A-lifetime-2",
    );
    transaction = startMainFrameDocumentNavigation(transaction, {});
    transaction = commitMainFrameDocumentNavigation(transaction, 2);
    transaction = recordMainFrameNavigationIntent(
      transaction,
      "A-replayed-old-intent",
      "A",
      1,
      "A-lifetime-1",
    );

    expect(
      navigationIdForDocumentEvent(transaction, "A-replayed-old-intent"),
    ).toBeUndefined();
  });

  it("keeps a slow committed navigation current until its document commits", () => {
    const request = {};
    let transaction = registerMainFrameDocument(
      createNavigationTransaction(),
      "source",
    );
    transaction = recordMainFrameNavigationIntent(
      transaction,
      "intent-1",
      "source",
      1,
    );
    transaction = startMainFrameDocumentNavigation(transaction, request);

    expect(navigationIdForDocumentEvent(transaction, "intent-1")).toBe(1);
    expect(transaction.committedNavigationIds).toEqual(new Set());

    transaction = commitMainFrameDocumentNavigation(transaction);
    expect(transaction.committedNavigationIds).toEqual(new Set([1]));
  });

  it("removes a cancelled beforeunload intent without offsetting the next intent", () => {
    const request = {};
    let transaction = registerMainFrameDocument(
      createNavigationTransaction(),
      "source",
    );
    transaction = recordMainFrameNavigationIntent(
      transaction,
      "cancelled-1",
      "source",
      1,
    );
    transaction = cancelMainFrameNavigationIntent(transaction, "cancelled-1");
    transaction = recordMainFrameNavigationIntent(
      transaction,
      "intent-2",
      "source",
      2,
    );
    transaction = startMainFrameDocumentNavigation(transaction, request);

    expect(
      navigationIdForDocumentEvent(transaction, "cancelled-1"),
    ).toBeUndefined();
    expect(navigationIdForDocumentEvent(transaction, "intent-2")).toBe(1);
  });

  it("keeps an intent bound to a redirect chain's final committed request", () => {
    const firstRequest = {};
    const finalRequest = {};
    let transaction = registerMainFrameDocument(
      createNavigationTransaction(),
      "source",
    );
    transaction = recordMainFrameNavigationIntent(
      transaction,
      "intent-1",
      "source",
      1,
    );
    transaction = startMainFrameDocumentNavigation(transaction, firstRequest);
    transaction = startMainFrameDocumentNavigation(
      transaction,
      finalRequest,
      firstRequest,
    );
    transaction = commitMainFrameDocumentNavigation(transaction);

    expect(navigationIdForDocumentEvent(transaction, "intent-1")).toBe(1);
    expect(transaction.committedNavigationIds).toEqual(new Set([1]));
  });

  it("settles late failures against their own superseded request", () => {
    const firstRequest = {};
    const secondRequest = {};
    let transaction = registerMainFrameDocument(
      createNavigationTransaction(),
      "source",
    );
    transaction = recordMainFrameNavigationIntent(
      transaction,
      "intent-1",
      "source",
      1,
    );
    transaction = startMainFrameDocumentNavigation(transaction, firstRequest);
    transaction = recordMainFrameNavigationIntent(
      transaction,
      "intent-2",
      "source",
      2,
    );
    transaction = startMainFrameDocumentNavigation(transaction, secondRequest);
    transaction = failMainFrameDocumentNavigation(transaction, firstRequest);
    transaction = commitMainFrameDocumentNavigation(transaction);

    expect(navigationIdForRequestFailure(transaction, firstRequest)).toBe(1);
    expect(navigationIdForDocumentEvent(transaction, "intent-1")).toBe(1);
    expect(transaction.committedNavigationIds).toEqual(new Set([2]));
  });

  it("does not bind a late intent for a failed attempt to a later commit", () => {
    const firstRequest = {};
    const secondRequest = {};
    let transaction = registerMainFrameDocument(
      createNavigationTransaction(),
      "source",
    );
    transaction = startMainFrameDocumentNavigation(transaction, firstRequest);
    transaction = failMainFrameDocumentNavigation(transaction, firstRequest);
    transaction = startMainFrameDocumentNavigation(transaction, secondRequest);
    transaction = recordMainFrameNavigationIntent(
      transaction,
      "late-intent-1",
      "source",
      1,
    );
    transaction = commitMainFrameDocumentNavigation(transaction);

    expect(navigationIdForDocumentEvent(transaction, "late-intent-1")).toBe(1);
    expect(transaction.committedNavigationIds.has(1)).toBe(false);
  });

  it("fails closed when an intent cannot prove an attempt ordinal", () => {
    const request = {};
    let transaction = registerMainFrameDocument(
      createNavigationTransaction(),
      "source",
    );
    transaction = recordMainFrameNavigationIntent(
      transaction,
      "ambiguous",
      "source",
      2,
    );
    transaction = startMainFrameDocumentNavigation(transaction, request);
    transaction = commitMainFrameDocumentNavigation(transaction);

    expect(
      navigationIdForDocumentEvent(transaction, "ambiguous"),
    ).toBeUndefined();
  });
});
