export type DocumentSnapshot = Readonly<{
  epoch: number;
  url: string;
}>;

export type NavigationTransactionId = number;

type NavigationAttemptState = "pending" | "failed" | "superseded" | "committed";

type NavigationAttempt = Readonly<{
  id: NavigationTransactionId;
  intentToken?: string;
  requestIdentities: readonly unknown[];
  sourceDocumentToken?: string;
  sourceDocumentGeneration?: number;
  sourceEpoch: number;
  sourceOrdinal?: number;
  state: NavigationAttemptState;
}>;

type NavigationIntent = Readonly<{
  sourceDocumentToken: string;
  sourceDocumentGeneration: number;
  intentSequence: number;
}>;

export type NavigationTransaction = Readonly<{
  activeDocumentGeneration?: number;
  activeDocumentToken?: string;
  awaitingMainFrameDocumentRegistration: boolean;
  cancelledNavigationIntentTokens: ReadonlySet<string>;
  cancelledIntentAttemptIds: ReadonlySet<NavigationTransactionId>;
  committedNavigationIds: ReadonlySet<NavigationTransactionId>;
  documentEpoch: number;
  documentGenerations: ReadonlyMap<string, number>;
  documentLifetimeGenerations: ReadonlyMap<string, number>;
  navigationAttempts: ReadonlyMap<NavigationTransactionId, NavigationAttempt>;
  navigationIntentRecords: ReadonlyMap<string, NavigationIntent>;
  navigationIntentTokens: ReadonlySet<string>;
  nextTransactionId: NavigationTransactionId;
  pendingMainFrameNavigation?: NavigationTransactionId;
  pendingNavigationIntents: ReadonlyMap<string, NavigationIntent>;
  replacedBy: ReadonlyMap<number, NavigationTransactionId>;
  requestToAttempt: ReadonlyMap<unknown, NavigationTransactionId>;
  sourceAttemptOrdinals: ReadonlyMap<string, number>;
}>;

export const createNavigationTransaction = (): NavigationTransaction => ({
  awaitingMainFrameDocumentRegistration: false,
  cancelledNavigationIntentTokens: new Set(),
  cancelledIntentAttemptIds: new Set(),
  committedNavigationIds: new Set(),
  documentEpoch: 0,
  documentGenerations: new Map(),
  documentLifetimeGenerations: new Map(),
  navigationAttempts: new Map(),
  navigationIntentRecords: new Map(),
  navigationIntentTokens: new Set(),
  nextTransactionId: 1,
  pendingNavigationIntents: new Map(),
  replacedBy: new Map(),
  requestToAttempt: new Map(),
  sourceAttemptOrdinals: new Map(),
});

export const snapshotDocument = (
  transaction: NavigationTransaction,
  url: string,
): DocumentSnapshot => ({ epoch: transaction.documentEpoch, url });

const canProveIntentOrder = (
  transaction: NavigationTransaction,
  intent: NavigationIntent,
): boolean => {
  for (let sequence = 1; sequence < intent.intentSequence; sequence += 1) {
    if (
      ![...transaction.navigationIntentRecords.values()].some(
        (record) =>
          record.sourceDocumentToken === intent.sourceDocumentToken &&
          record.sourceDocumentGeneration === intent.sourceDocumentGeneration &&
          record.intentSequence === sequence,
      )
    ) {
      return false;
    }
  }
  return true;
};

const bindAvailableIntents = (
  transaction: NavigationTransaction,
  sourceDocumentToken: string,
): NavigationTransaction => {
  let next = transaction;
  while (true) {
    const pending = [...next.pendingNavigationIntents.entries()]
      .filter(
        ([, intent]) => intent.sourceDocumentToken === sourceDocumentToken,
      )
      .sort(
        ([, left], [, right]) => left.intentSequence - right.intentSequence,
      )[0];
    const attempt = [...next.navigationAttempts.values()]
      .filter(
        (candidate) =>
          candidate.sourceDocumentToken === sourceDocumentToken &&
          candidate.sourceDocumentGeneration ===
            pending?.[1].sourceDocumentGeneration &&
          candidate.sourceOrdinal !== undefined &&
          candidate.intentToken === undefined &&
          !next.cancelledIntentAttemptIds.has(candidate.id),
      )
      .sort(
        (left, right) => (left.sourceOrdinal ?? 0) - (right.sourceOrdinal ?? 0),
      )[0];
    if (
      attempt === undefined ||
      pending === undefined ||
      !canProveIntentOrder(next, pending[1])
    ) {
      return next;
    }
    const navigationAttempts = new Map(next.navigationAttempts);
    navigationAttempts.set(attempt.id, { ...attempt, intentToken: pending[0] });
    const pendingNavigationIntents = new Map(next.pendingNavigationIntents);
    pendingNavigationIntents.delete(pending[0]);
    next = { ...next, navigationAttempts, pendingNavigationIntents };
  }
};

const settleAttempt = (
  transaction: NavigationTransaction,
  id: NavigationTransactionId,
  state: Exclude<NavigationAttemptState, "committed">,
): NavigationTransaction => {
  const attempt = transaction.navigationAttempts.get(id);
  if (attempt === undefined || attempt.state !== "pending") return transaction;
  const navigationAttempts = new Map(transaction.navigationAttempts);
  navigationAttempts.set(id, { ...attempt, state });
  const {
    pendingMainFrameNavigation: _pendingMainFrameNavigation,
    ...settled
  } = transaction;
  return {
    ...settled,
    navigationAttempts,
    ...(transaction.pendingMainFrameNavigation === id
      ? {}
      : { pendingMainFrameNavigation: transaction.pendingMainFrameNavigation }),
  };
};

const attachRequest = (
  transaction: NavigationTransaction,
  id: NavigationTransactionId,
  request: unknown,
): NavigationTransaction => {
  const attempt = transaction.navigationAttempts.get(id);
  if (attempt === undefined) return transaction;
  const navigationAttempts = new Map(transaction.navigationAttempts);
  navigationAttempts.set(id, {
    ...attempt,
    requestIdentities: [...attempt.requestIdentities, request],
  });
  return {
    ...transaction,
    navigationAttempts,
    requestToAttempt: new Map([...transaction.requestToAttempt, [request, id]]),
  };
};

export const registerMainFrameDocument = (
  transaction: NavigationTransaction,
  documentToken: string,
  documentLifetimeToken = documentToken,
): NavigationTransaction => {
  if (
    !transaction.awaitingMainFrameDocumentRegistration &&
    transaction.activeDocumentToken === documentToken
  ) {
    return transaction;
  }
  const documentGeneration =
    (transaction.documentGenerations.get(documentToken) ?? 0) + 1;
  return {
    ...transaction,
    activeDocumentToken: documentToken,
    activeDocumentGeneration: documentGeneration,
    awaitingMainFrameDocumentRegistration: false,
    documentGenerations: new Map([
      ...transaction.documentGenerations,
      [documentToken, documentGeneration],
    ]),
    documentLifetimeGenerations: new Map([
      ...transaction.documentLifetimeGenerations,
      [documentLifetimeToken, documentGeneration],
    ]),
  };
};

export const recordMainFrameNavigationIntent = (
  transaction: NavigationTransaction,
  navigationIntentToken: string,
  sourceDocumentToken: string,
  intentSequence: number,
  sourceDocumentLifetimeToken = sourceDocumentToken,
): NavigationTransaction => {
  if (
    transaction.navigationIntentTokens.has(navigationIntentToken) ||
    !Number.isSafeInteger(intentSequence) ||
    intentSequence < 1
  ) {
    return transaction;
  }
  const sourceDocumentGeneration = transaction.documentLifetimeGenerations.get(
    sourceDocumentLifetimeToken,
  );
  if (sourceDocumentGeneration === undefined) return transaction;
  const intent = {
    sourceDocumentToken,
    sourceDocumentGeneration,
    intentSequence,
  };
  const recorded: NavigationTransaction = {
    ...transaction,
    navigationIntentRecords: new Map([
      ...transaction.navigationIntentRecords,
      [navigationIntentToken, intent],
    ]),
    navigationIntentTokens: new Set([
      ...transaction.navigationIntentTokens,
      navigationIntentToken,
    ]),
    pendingNavigationIntents: new Map([
      ...transaction.pendingNavigationIntents,
      [navigationIntentToken, intent],
    ]),
  };
  return bindAvailableIntents(recorded, sourceDocumentToken);
};

export const cancelMainFrameNavigationIntent = (
  transaction: NavigationTransaction,
  navigationIntentToken: string,
): NavigationTransaction => {
  if (transaction.cancelledNavigationIntentTokens.has(navigationIntentToken))
    return transaction;
  const boundAttempt = [...transaction.navigationAttempts.values()].find(
    (attempt) => attempt.intentToken === navigationIntentToken,
  );
  const navigationAttempts = new Map(transaction.navigationAttempts);
  if (boundAttempt !== undefined) {
    const { intentToken: _intentToken, ...unboundAttempt } = boundAttempt;
    navigationAttempts.set(boundAttempt.id, {
      ...unboundAttempt,
    });
  }
  const pendingNavigationIntents = new Map(
    transaction.pendingNavigationIntents,
  );
  pendingNavigationIntents.delete(navigationIntentToken);
  return {
    ...transaction,
    cancelledNavigationIntentTokens: new Set([
      ...transaction.cancelledNavigationIntentTokens,
      navigationIntentToken,
    ]),
    cancelledIntentAttemptIds:
      boundAttempt === undefined
        ? transaction.cancelledIntentAttemptIds
        : new Set([...transaction.cancelledIntentAttemptIds, boundAttempt.id]),
    navigationAttempts,
    pendingNavigationIntents,
  };
};

export const startMainFrameDocumentNavigation = (
  transaction: NavigationTransaction,
  request: unknown,
  redirectedFrom?: unknown,
): NavigationTransaction => {
  const redirectedAttemptId =
    redirectedFrom === null || redirectedFrom === undefined
      ? undefined
      : transaction.requestToAttempt.get(redirectedFrom);
  if (redirectedAttemptId !== undefined)
    return attachRequest(transaction, redirectedAttemptId, request);

  const settled =
    transaction.pendingMainFrameNavigation === undefined
      ? transaction
      : settleAttempt(
          transaction,
          transaction.pendingMainFrameNavigation,
          "superseded",
        );
  const id = settled.nextTransactionId;
  const sourceDocumentToken = settled.activeDocumentToken;
  const sourceDocumentGeneration = settled.activeDocumentGeneration;
  const sourceOrdinal =
    sourceDocumentToken === undefined
      ? undefined
      : (settled.sourceAttemptOrdinals.get(sourceDocumentToken) ?? 0) + 1;
  const attempt: NavigationAttempt = {
    id,
    requestIdentities: [request],
    ...(sourceDocumentToken === undefined ? {} : { sourceDocumentToken }),
    ...(sourceDocumentGeneration === undefined
      ? {}
      : { sourceDocumentGeneration }),
    sourceEpoch: settled.documentEpoch,
    ...(sourceOrdinal === undefined ? {} : { sourceOrdinal }),
    state: "pending",
  };
  const started: NavigationTransaction = {
    ...settled,
    navigationAttempts: new Map([...settled.navigationAttempts, [id, attempt]]),
    nextTransactionId: id + 1,
    pendingMainFrameNavigation: id,
    requestToAttempt: new Map([...settled.requestToAttempt, [request, id]]),
    ...(sourceDocumentToken === undefined || sourceOrdinal === undefined
      ? {}
      : {
          sourceAttemptOrdinals: new Map([
            ...settled.sourceAttemptOrdinals,
            [sourceDocumentToken, sourceOrdinal],
          ]),
        }),
  };
  return sourceDocumentToken === undefined
    ? started
    : bindAvailableIntents(started, sourceDocumentToken);
};

export const pendingNavigationId = (
  transaction: NavigationTransaction,
): NavigationTransactionId | undefined =>
  transaction.pendingMainFrameNavigation;

export const navigationIdForRequestFailure = (
  transaction: NavigationTransaction,
  requestOrSourceEpoch: unknown,
): NavigationTransactionId | undefined =>
  typeof requestOrSourceEpoch === "number"
    ? transaction.replacedBy.get(requestOrSourceEpoch)
    : transaction.requestToAttempt.get(requestOrSourceEpoch);

export const navigationIdForDocumentEvent = (
  transaction: NavigationTransaction,
  navigationIntentToken: string,
): NavigationTransactionId | undefined =>
  [...transaction.navigationAttempts.values()].find(
    (attempt) => attempt.intentToken === navigationIntentToken,
  )?.id;

export const failMainFrameDocumentNavigation = (
  transaction: NavigationTransaction,
  request: unknown,
  _diagnosticOccurredAt?: number,
): NavigationTransaction => {
  const id = transaction.requestToAttempt.get(request);
  return id === undefined
    ? transaction
    : settleAttempt(transaction, id, "failed");
};

export const commitMainFrameDocumentNavigation = (
  transaction: NavigationTransaction,
  _diagnosticOccurredAt?: number,
): NavigationTransaction => {
  const id = transaction.pendingMainFrameNavigation;
  if (id === undefined) return transaction;
  const attempt = transaction.navigationAttempts.get(id);
  if (attempt === undefined || attempt.state !== "pending") return transaction;
  const navigationAttempts = new Map(transaction.navigationAttempts);
  navigationAttempts.set(id, { ...attempt, state: "committed" });
  const {
    activeDocumentGeneration: _activeDocumentGeneration,
    activeDocumentToken: _activeDocumentToken,
    pendingMainFrameNavigation: _pendingMainFrameNavigation,
    ...committed
  } = transaction;
  return {
    ...committed,
    awaitingMainFrameDocumentRegistration: true,
    committedNavigationIds: new Set([
      ...transaction.committedNavigationIds,
      id,
    ]),
    documentEpoch: attempt.sourceEpoch + 1,
    navigationAttempts,
    replacedBy: new Map([...transaction.replacedBy, [attempt.sourceEpoch, id]]),
  };
};
