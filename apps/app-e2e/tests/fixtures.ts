import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  test as baseTest,
  type ConsoleMessage,
  type TestInfo,
} from "@playwright/test";

import { EditorPage } from "#/pages/editor-page.ts";
import { LoginPage } from "#/pages/login-page.ts";
import { QaReviewPage } from "#/pages/qa-review-page.ts";

import {
  cancelMainFrameNavigationIntent,
  commitMainFrameDocumentNavigation,
  createNavigationTransaction,
  failMainFrameDocumentNavigation,
  navigationIdForDocumentEvent,
  navigationIdForRequestFailure,
  recordMainFrameNavigationIntent,
  registerMainFrameDocument,
  snapshotDocument,
  startMainFrameDocumentNavigation,
  type DocumentSnapshot,
  type NavigationTransactionId,
} from "../navigation-transaction.ts";

// ── Types ────────────────────────────────────────────────────────────

export type E2ERefs = Record<string, string | undefined> & {
  project: string;
  "user:admin": string;
  "content-node:elements": string;
};

interface E2EFixtures {
  /** Ref→ID mapping from seeded data (e.g., refs["project"], refs["el:001"]) */
  refs: E2ERefs;
  /** LoginPage Page Object for the current page */
  loginPage: LoginPage;
  /** EditorPage Page Object for the current page */
  editorPage: EditorPage;
  /** QaReviewPage Page Object for QA review workbench */
  qaReviewPage: QaReviewPage;
  /** Pre-built URL to the seeded project dashboard */
  projectUrl: string;
}

type DiagnosticKind =
  | "app-error"
  | "critical-resource"
  | "http-5xx"
  | "page-error"
  | "framework-warning"
  | "websocket";

type ExpectedDiagnostic = {
  kind: DiagnosticKind;
  value: string;
};

type DiagnosticFailure = ExpectedDiagnostic & {
  errorName?: string;
};
type DiagnosticSource =
  | "browser-event"
  | "console"
  | "page"
  | "request"
  | "response"
  | "websocket";
type RecordedDiagnosticFailure = DiagnosticFailure & {
  documentToken?: string;
  documentUrl: string;
  errorName?: string;
  epoch: number;
  occurredAt: number;
  navigationTransactionId?: NavigationTransactionId;
  requestId?: string;
  source: DiagnosticSource;
};

type ControlledCancellation = {
  documentToken?: string;
  documentUrl: string;
  expected: boolean;
  id: string;
  kind: "consumer" | "navigation" | "signal";
  navigationIntentToken?: string;
  recordId?: string;
  time: number;
  url: string;
  version: 1;
};

type ControlledCancellationError = ControlledCancellation & {
  documentToken: string;
  errorName: "ExpectedRequestCancellationError";
  recordId: string;
};

type BoundCancellationError = ControlledCancellationError & {
  navigationTransactionId?: NavigationTransactionId;
};

type BrowserPageError = Readonly<{
  cancellationRecordId?: string;
  documentToken: string;
  documentUrl: string;
  errorName: string;
  occurredAt: number;
  recordId: string;
  value: string;
}>;

type BrowserNavigationIntent = Readonly<{
  cancelled?: true;
  documentToken: string;
  documentLifetimeToken: string;
  documentUrl: string;
  intentSequence: number;
  navigationIntentToken: string;
  occurredAt: number;
}>;

const controlledCancellation = (
  value: unknown,
): ControlledCancellation | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const documentUrl = Reflect.get(value, "documentUrl");
  const documentToken = Reflect.get(value, "documentToken");
  const expected = Reflect.get(value, "expected");
  const id = Reflect.get(value, "id");
  const kind = Reflect.get(value, "kind");
  const navigationIntentToken = Reflect.get(value, "navigationIntentToken");
  const recordId = Reflect.get(value, "recordId");
  const time = Reflect.get(value, "time");
  const url = Reflect.get(value, "url");
  const version = Reflect.get(value, "version");
  if (
    typeof documentUrl !== "string" ||
    (documentToken !== undefined && typeof documentToken !== "string") ||
    expected !== true ||
    typeof id !== "string" ||
    (kind !== "consumer" && kind !== "navigation" && kind !== "signal") ||
    (navigationIntentToken !== undefined &&
      typeof navigationIntentToken !== "string") ||
    (recordId !== undefined && typeof recordId !== "string") ||
    typeof time !== "number" ||
    typeof url !== "string" ||
    version !== 1
  ) {
    return undefined;
  }
  return {
    documentUrl,
    ...(typeof documentToken === "string" ? { documentToken } : {}),
    expected,
    id,
    kind,
    ...(typeof navigationIntentToken === "string"
      ? { navigationIntentToken }
      : {}),
    ...(typeof recordId === "string" ? { recordId } : {}),
    time,
    url,
    version,
  };
};

const browserNavigationIntent = (
  value: unknown,
): BrowserNavigationIntent | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const documentToken = Reflect.get(value, "documentToken");
  const documentLifetimeToken = Reflect.get(value, "documentLifetimeToken");
  const documentUrl = Reflect.get(value, "documentUrl");
  const cancelled = Reflect.get(value, "cancelled");
  const intentSequence = Reflect.get(value, "intentSequence");
  const navigationIntentToken = Reflect.get(value, "navigationIntentToken");
  const occurredAt = Reflect.get(value, "occurredAt");
  if (
    typeof documentToken !== "string" ||
    typeof documentLifetimeToken !== "string" ||
    typeof documentUrl !== "string" ||
    typeof navigationIntentToken !== "string" ||
    !Number.isSafeInteger(intentSequence) ||
    intentSequence < 1 ||
    (cancelled !== undefined && cancelled !== true) ||
    typeof occurredAt !== "number" ||
    !Number.isFinite(occurredAt)
  ) {
    return undefined;
  }
  return {
    ...(cancelled === true ? { cancelled } : {}),
    documentToken,
    documentLifetimeToken,
    documentUrl,
    intentSequence,
    navigationIntentToken,
    occurredAt,
  };
};

const controlledCancellationError = (
  value: unknown,
): ControlledCancellationError | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const cancellation = controlledCancellation(value);
  if (cancellation === undefined) return undefined;
  const documentToken = Reflect.get(value, "documentToken");
  const recordId = Reflect.get(value, "recordId");
  if (
    Reflect.get(value, "errorName") !== "ExpectedRequestCancellationError" ||
    typeof documentToken !== "string" ||
    typeof recordId !== "string"
  )
    return undefined;
  return {
    ...cancellation,
    documentToken,
    errorName: "ExpectedRequestCancellationError",
    recordId,
  };
};

const browserPageError = (value: unknown): BrowserPageError | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const cancellationRecordId = Reflect.get(value, "cancellationRecordId");
  const documentToken = Reflect.get(value, "documentToken");
  const documentUrl = Reflect.get(value, "documentUrl");
  const errorName = Reflect.get(value, "errorName");
  const occurredAt = Reflect.get(value, "occurredAt");
  const recordId = Reflect.get(value, "recordId");
  const errorValue = Reflect.get(value, "value");
  if (
    (cancellationRecordId !== undefined &&
      typeof cancellationRecordId !== "string") ||
    typeof documentToken !== "string" ||
    typeof documentUrl !== "string" ||
    typeof errorName !== "string" ||
    typeof occurredAt !== "number" ||
    typeof recordId !== "string" ||
    typeof errorValue !== "string"
  ) {
    return undefined;
  }
  return {
    ...(typeof cancellationRecordId === "string"
      ? { cancellationRecordId }
      : {}),
    documentToken,
    documentUrl,
    errorName,
    occurredAt,
    recordId,
    value: errorValue,
  };
};

const failureUrl = (value: string): string | null => {
  const match =
    /^(?:fetch|xhr) (.+): (?:net::ERR_ABORTED|NS_BINDING_ABORTED)$/.exec(value);
  return match?.[1] ?? null;
};

export const isReplacedNavigationAbort = (
  failure: RecordedDiagnosticFailure,
  committedNavigationIds: ReadonlySet<NavigationTransactionId>,
): boolean =>
  failure.source === "request" &&
  failure.kind === "critical-resource" &&
  failure.navigationTransactionId !== undefined &&
  committedNavigationIds.has(failure.navigationTransactionId) &&
  /^(?:fetch|script|stylesheet|xhr) .+: (?:net::ERR_ABORTED|NS_BINDING_ABORTED)$/.test(
    failure.value,
  );

export const isControlledCancellation = (
  failure: RecordedDiagnosticFailure,
  cancellation: ControlledCancellation,
): boolean => {
  if (
    failure.source !== "request" ||
    failure.kind !== "critical-resource" ||
    failure.requestId === undefined ||
    !cancellation.expected
  ) {
    return false;
  }

  const url = failureUrl(failure.value);
  if (url === null) return false;

  try {
    return (
      (failure.documentToken === undefined ||
        cancellation.documentToken === undefined ||
        failure.documentToken === cancellation.documentToken) &&
      new URL(url).href === new URL(cancellation.url, url).href &&
      failure.requestId === cancellation.id
    );
  } catch {
    return false;
  }
};

export const consumeControlledCancellation = (
  failure: RecordedDiagnosticFailure,
  cancellations: readonly ControlledCancellation[],
  consumedCancellationRecordIds: Set<string>,
): boolean => {
  for (const cancellation of cancellations) {
    if (
      cancellation.recordId !== undefined &&
      !consumedCancellationRecordIds.has(cancellation.recordId) &&
      isControlledCancellation(failure, cancellation)
    ) {
      consumedCancellationRecordIds.add(cancellation.recordId);
      return true;
    }
  }
  return false;
};

const sameDocumentUrl = (left: string, right: string): boolean => {
  try {
    return new URL(left).href === new URL(right, left).href;
  } catch {
    return false;
  }
};

export const isNavigationOwnedCancellationPageError = (
  failure: RecordedDiagnosticFailure,
  cancellation: BoundCancellationError | undefined,
  committedNavigationIds: ReadonlySet<NavigationTransactionId>,
): boolean =>
  failure.source === "page" &&
  failure.kind === "page-error" &&
  failure.errorName === "ExpectedRequestCancellationError" &&
  failure.navigationTransactionId !== undefined &&
  committedNavigationIds.has(failure.navigationTransactionId) &&
  cancellation !== undefined &&
  cancellation.expected &&
  cancellation.kind === "navigation" &&
  cancellation.navigationTransactionId === failure.navigationTransactionId &&
  (failure.documentToken === undefined ||
    failure.documentToken === cancellation.documentToken) &&
  sameDocumentUrl(failure.documentUrl, cancellation.documentUrl);

export const consumeNavigationOwnedCancellationPageError = (
  failure: RecordedDiagnosticFailure,
  cancellation: BoundCancellationError | undefined,
  committedNavigationIds: ReadonlySet<NavigationTransactionId>,
  consumedCancellationRecordIds: Set<string>,
): boolean => {
  if (
    !isNavigationOwnedCancellationPageError(
      failure,
      cancellation,
      committedNavigationIds,
    ) ||
    cancellation === undefined ||
    consumedCancellationRecordIds.has(cancellation.recordId)
  ) {
    return false;
  }
  consumedCancellationRecordIds.add(cancellation.recordId);
  return true;
};

interface E2EWorkerFixtures {
  /** Path to the admin user's storageState file (worker-scoped, reused across tests) */
  adminStorageState: string;
}

interface E2EOptions {
  /** Exact failures that this scenario intentionally exercises. */
  expectedDiagnostics: ExpectedDiagnostic[];
}

// ── Load refs from the external lifecycle runner ─────────────────────

const REFS_PATH =
  process.env.CAT_E2E_REFS_PATH ??
  resolve(import.meta.dirname, "../test-results/e2e-refs.json");

let _cachedRefs: E2ERefs | undefined;

const loadRefs = (): E2ERefs => {
  if (_cachedRefs) return _cachedRefs;
  try {
    const raw = readFileSync(REFS_PATH, "utf-8");
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    _cachedRefs = JSON.parse(raw) as E2ERefs;
  } catch {
    throw new Error(
      `[e2e fixtures] Failed to load refs from ${REFS_PATH}. ` +
        "Did the execution cell finish fixture hydration?",
    );
  }

  // Validate required refs
  const required = ["project", "user:admin", "content-node:elements"];
  for (const ref of required) {
    if (!_cachedRefs[ref]) {
      throw new Error(
        `[e2e fixtures] Required ref "${ref}" not found in ${REFS_PATH}.`,
      );
    }
  }

  return _cachedRefs;
};

// ── Credentials (must match datasets/e2e/seed/users.json) ───────────

const ADMIN_EMAIL = "admin@cat.dev";
const ADMIN_PASSWORD = "password";

const isDiagnosticEvent = (
  value: unknown,
): value is {
  code: string;
  level: "error" | "fatal";
  message: string;
  version: 1;
} =>
  typeof value === "object" &&
  value !== null &&
  Reflect.get(value, "version") === 1 &&
  (Reflect.get(value, "level") === "error" ||
    Reflect.get(value, "level") === "fatal") &&
  typeof Reflect.get(value, "code") === "string" &&
  typeof Reflect.get(value, "message") === "string";

const consoleDiagnostic = async (
  message: ConsoleMessage,
): Promise<DiagnosticFailure | undefined> => {
  if (message.type() === "warning") {
    const text = message.text();
    if (/\[Vue warn\]|\bVike(?:Error|Warning)\b/i.test(text)) {
      return { kind: "framework-warning", value: text };
    }
  }
  if (message.type() !== "error") return undefined;
  for (const argument of message.args()) {
    try {
      const value: unknown = await argument.jsonValue();
      if (isDiagnosticEvent(value)) {
        return {
          kind: "app-error",
          value: `${value.code}: ${value.message}`,
        };
      }
    } catch {
      // Console handles can become unavailable as a navigation replaces a page.
    }
  }
  return {
    kind: "framework-warning",
    value: `Unstructured console.error: ${message.text()}`,
  };
};

const assertDiagnostics = async (
  failures: readonly DiagnosticFailure[],
  expected: readonly ExpectedDiagnostic[],
  testInfo: TestInfo,
): Promise<void> => {
  const unmatched = [...expected];
  const unexpected = failures.filter((failure) => {
    const index = unmatched.findIndex(
      (candidate) =>
        candidate.kind === failure.kind && candidate.value === failure.value,
    );
    if (index < 0) return true;
    unmatched.splice(index, 1);
    return false;
  });
  if (unexpected.length === 0 && unmatched.length === 0) return;

  const message = [
    "Browser diagnostics failed.",
    ...unexpected.map(
      (failure) => `unexpected ${failure.kind}: ${failure.value}`,
    ),
    ...unmatched.map(
      (failure) => `missing expected ${failure.kind}: ${failure.value}`,
    ),
  ].join("\n");
  await testInfo.attach("browser-diagnostics.txt", {
    body: message,
    contentType: "text/plain",
  });
  throw new Error(message);
};

// ── Extend Playwright test ──────────────────────────────────────────

export const test = baseTest.extend<
  E2EFixtures & E2EOptions,
  E2EWorkerFixtures
>({
  expectedDiagnostics: [[], { option: true }],
  // Worker-scoped: authenticate admin once, reuse storageState
  adminStorageState: [
    async ({ browser }, use) => {
      const id = test.info().parallelIndex;
      const fileName = resolve(
        test.info().project.outputDir,
        `.auth/admin-${id}.json`,
      );

      // Reuse existing auth if available
      const { existsSync } = await import("node:fs");
      if (existsSync(fileName)) {
        await use(fileName);
        return;
      }

      // Authenticate via UI
      // browser.newPage() does not inherit project-level baseURL; pass it explicitly.
      const context = await browser.newContext({
        baseURL:
          process.env.CAT_E2E_BASE_URL ??
          `http://127.0.0.1:${process.env.PORT ?? 3000}`,
        locale: "zh-CN",
      });
      const page = await context.newPage();
      const loginPage = new LoginPage(page);
      await loginPage.loginAndVerify(ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.context().storageState({ path: fileName });
      await context.close();
      await use(fileName);
    },
    { scope: "worker" },
  ],

  // Every test gets a page with admin auth
  storageState: async ({ adminStorageState }, use) => use(adminStorageState),

  page: async ({ page, expectedDiagnostics }, use, testInfo) => {
    const failures: RecordedDiagnosticFailure[] = [];
    const diagnosticTasks = new Set<Promise<void>>();
    let navigation = createNavigationTransaction();
    const requestDocuments = new WeakMap<object, DocumentSnapshot>();
    const requestDocumentTokens = new WeakMap<object, string | undefined>();
    const requestIds = new WeakMap<object, string | undefined>();
    const documents = new Map<string, DocumentSnapshot>();
    const cancellations: ControlledCancellation[] = [];
    const cancellationKeys = new Set<string>();
    const cancellationErrors = new Map<string, BoundCancellationError>();
    const pageErrors = new Map<string, BrowserPageError>();
    const pageErrorCancellations = new WeakMap<
      RecordedDiagnosticFailure,
      BoundCancellationError
    >();
    const recordDocument = (value: unknown): void => {
      if (typeof value !== "object" || value === null) return;
      const documentToken = Reflect.get(value, "documentToken");
      const documentLifetimeToken = Reflect.get(value, "documentLifetimeToken");
      const documentUrl = Reflect.get(value, "documentUrl");
      if (
        typeof documentToken !== "string" ||
        typeof documentLifetimeToken !== "string" ||
        typeof documentUrl !== "string"
      )
        return;
      navigation = registerMainFrameDocument(
        navigation,
        documentToken,
        documentLifetimeToken,
      );
      documents.set(documentToken, snapshotDocument(navigation, documentUrl));
    };
    const recordNavigationIntent = (value: unknown): void => {
      const intent = browserNavigationIntent(value);
      if (intent === undefined) return;
      navigation = recordMainFrameNavigationIntent(
        navigation,
        intent.navigationIntentToken,
        intent.documentToken,
        intent.intentSequence,
        intent.documentLifetimeToken,
      );
      if (intent.cancelled)
        navigation = cancelMainFrameNavigationIntent(
          navigation,
          intent.navigationIntentToken,
        );
    };
    const recordCancellationError = (value: unknown): void => {
      const cancellation = controlledCancellationError(value);
      if (cancellation === undefined) return;
      if (cancellationErrors.has(cancellation.recordId)) return;
      cancellationErrors.set(cancellation.recordId, cancellation);
    };
    const recordCancellation = (value: unknown): void => {
      const cancellation = controlledCancellation(value);
      if (cancellation === undefined) return;
      const key =
        cancellation.recordId ??
        [
          cancellation.id,
          cancellation.kind,
          cancellation.time,
          cancellation.documentUrl,
        ].join("\u0000");
      if (cancellationKeys.has(key)) return;
      cancellationKeys.add(key);
      cancellations.push(cancellation);
    };
    const recordPageError = (value: unknown): void => {
      const pageError = browserPageError(value);
      if (pageError !== undefined)
        pageErrors.set(pageError.recordId, pageError);
    };
    const readStoredRecords = async (storageKey: string): Promise<unknown[]> =>
      page.evaluate((key) => {
        try {
          const stored = JSON.parse(sessionStorage.getItem(key) ?? "[]");
          return Array.isArray(stored) ? stored : [];
        } catch {
          return [];
        }
      }, storageKey);
    const replayStoredDiagnostics = async (): Promise<void> => {
      for (const intent of await readStoredRecords(
        "__CAT_E2E_NAVIGATION_INTENT_RECORDS__",
      ))
        recordNavigationIntent(intent);
      for (const cancellation of await readStoredRecords(
        "__CAT_E2E_CANCELLATION_RECORDS__",
      ))
        recordCancellation(cancellation);
      for (const cancellationError of await readStoredRecords(
        "__CAT_E2E_CANCELLATION_ERROR_RECORDS__",
      ))
        recordCancellationError(cancellationError);
      for (const pageError of await readStoredRecords(
        "__CAT_E2E_PAGE_ERROR_RECORDS__",
      ))
        recordPageError(pageError);
    };
    const record = (
      failure: DiagnosticFailure | undefined,
      source: DiagnosticSource,
      document = snapshotDocument(navigation, page.url()),
      requestId?: string,
      navigationTransactionId?: NavigationTransactionId,
      occurredAt = Date.now(),
      documentToken?: string,
    ): RecordedDiagnosticFailure | undefined => {
      if (failure !== undefined) {
        const recorded = {
          ...failure,
          documentUrl: document.url,
          epoch: document.epoch,
          occurredAt,
          ...(navigationTransactionId === undefined
            ? {}
            : { navigationTransactionId }),
          ...(requestId === undefined ? {} : { requestId }),
          ...(documentToken === undefined ? {} : { documentToken }),
          source,
        };
        failures.push(recorded);
        return recorded;
      }
      return undefined;
    };
    await page.exposeBinding(
      "__catE2eRecordCancellation",
      (_source, value: unknown) => recordCancellation(value),
    );
    await page.exposeBinding("__catE2eRegisterDocument", (_source, value) => {
      recordDocument(value);
    });
    await page.exposeBinding(
      "__catE2eRecordNavigationIntent",
      (_source, value: unknown) => recordNavigationIntent(value),
    );
    await page.exposeBinding(
      "__catE2eRecordCancellationError",
      (_source, value: unknown) => recordCancellationError(value),
    );
    await page.exposeBinding("__catE2eRecordPageError", (_source, value) => {
      recordPageError(value);
    });
    await page.addInitScript(() => {
      type BrowserGlobal = {
        addEventListener?: (
          type: string,
          listener: (event: unknown) => void,
          options?: boolean,
        ) => void;
        __catE2eRecordCancellation?: (value: unknown) => unknown;
        __catE2eRecordCancellationError?: (value: unknown) => unknown;
        __catE2eRecordNavigationIntent?: (value: unknown) => unknown;
        __catE2eRecordPageError?: (value: unknown) => unknown;
        __catE2eRegisterDocument?: (value: unknown) => unknown;
        location: { href: string };
      };
      const events: unknown[] = [];
      const pendingRecords = new Set<Promise<unknown>>();
      const cancellationStorageKey = "__CAT_E2E_CANCELLATION_RECORDS__";
      const cancellationErrorStorageKey =
        "__CAT_E2E_CANCELLATION_ERROR_RECORDS__";
      const pageErrorStorageKey = "__CAT_E2E_PAGE_ERROR_RECORDS__";
      const navigationIntentStorageKey =
        "__CAT_E2E_NAVIGATION_INTENT_RECORDS__";
      const documentToken = crypto.randomUUID();
      let documentLifetimeToken = crypto.randomUUID();
      let recordSequence = 0;
      const cancellationRecordIds = new WeakMap<object, string>();
      const cancellationSnapshots = new WeakMap<
        object,
        Readonly<{
          navigationIntent?: Readonly<{
            intentSequence: number;
            navigationIntentToken: string;
          }>;
          recordId: string;
        }>
      >();
      const cancellationErrorRecordIds = new WeakMap<object, string>();
      const pageErrorRecordIds = new WeakMap<object, string>();
      let navigationIntent:
        | { intentSequence: number; navigationIntentToken: string }
        | undefined;
      let intentSequence = 0;
      Reflect.set(globalThis, "__CAT_E2E_DIAGNOSTICS__", events);
      Reflect.set(
        globalThis,
        "__CAT_E2E_PENDING_CANCELLATION_RECORDS__",
        pendingRecords,
      );
      const browser = globalThis as unknown as BrowserGlobal;
      const track = (bindingRecord: unknown): void => {
        if (
          typeof bindingRecord !== "object" ||
          bindingRecord === null ||
          typeof Reflect.get(bindingRecord, "then") !== "function"
        ) {
          return;
        }
        let task: Promise<unknown>;
        task = Promise.resolve(bindingRecord)
          .catch(() => undefined)
          .finally(() => pendingRecords.delete(task));
        pendingRecords.add(task);
      };
      const store = (key: string, value: unknown): void => {
        try {
          const stored = JSON.parse(sessionStorage.getItem(key) ?? "[]");
          if (!Array.isArray(stored)) return;
          stored.push(value);
          sessionStorage.setItem(key, JSON.stringify(stored.slice(-100)));
        } catch {
          // Bindings preserve diagnostics when storage is unavailable.
        }
      };
      const recordId = (kind: string): string =>
        `${documentToken}:${kind}:${++recordSequence}`;
      const errorDetail = (
        event: unknown,
      ):
        | {
            error?: object;
            errorName: string;
            value: string;
          }
        | undefined => {
        if (typeof event !== "object" || event === null) return undefined;
        const hasError = Reflect.has(event, "error");
        const hasReason = Reflect.has(event, "reason");
        if (!hasError && !hasReason) return undefined;
        const error = hasError
          ? Reflect.get(event, "error")
          : Reflect.get(event, "reason");
        const objectError =
          typeof error === "object" && error !== null ? error : undefined;
        const errorName =
          objectError === undefined
            ? undefined
            : Reflect.get(objectError, "name");
        const message =
          objectError === undefined
            ? undefined
            : Reflect.get(objectError, "message");
        let value: string;
        try {
          value = typeof message === "string" ? message : String(error);
        } catch {
          value = "Unstringifiable thrown value";
        }
        return {
          errorName: typeof errorName === "string" ? errorName : "Error",
          ...(objectError === undefined ? {} : { error: objectError }),
          value,
        };
      };
      const sendPageError = (event: unknown): void => {
        const detail = errorDetail(event);
        if (detail === undefined) return;
        const pageErrorRecordId = recordId("page-error");
        if (detail.error !== undefined) {
          if (pageErrorRecordIds.has(detail.error)) return;
          pageErrorRecordIds.set(detail.error, pageErrorRecordId);
        }
        queueMicrotask(() => {
          const cancellationRecordId =
            detail.error === undefined
              ? undefined
              : cancellationRecordIds.get(detail.error);
          const pageErrorRecord = {
            ...(cancellationRecordId === undefined
              ? {}
              : { cancellationRecordId }),
            documentToken,
            documentLifetimeToken,
            documentUrl: browser.location.href,
            errorName: detail.errorName,
            occurredAt: Date.now(),
            recordId: pageErrorRecordId,
            value: detail.value,
          };
          store(pageErrorStorageKey, pageErrorRecord);
          track(browser.__catE2eRecordPageError?.(pageErrorRecord));
        });
      };
      browser.addEventListener?.("cat:diagnostic", (event: unknown) => {
        events.push(Reflect.get(event as object, "detail"));
      });
      browser.addEventListener?.("error", sendPageError, true);
      browser.addEventListener?.("unhandledrejection", sendPageError, true);
      const registerCurrentDocument = (): void => {
        track(
          browser.__catE2eRegisterDocument?.({
            documentToken,
            documentLifetimeToken,
            documentUrl: browser.location.href,
          }),
        );
      };
      const mintNavigationIntent = (): {
        intentSequence: number;
        navigationIntentToken: string;
      } => {
        const minted = {
          intentSequence: ++intentSequence,
          navigationIntentToken: recordId("navigation-intent"),
        };
        navigationIntent = minted;
        const record = {
          documentToken,
          documentLifetimeToken,
          documentUrl: browser.location.href,
          ...minted,
          occurredAt: Date.now(),
        };
        store(navigationIntentStorageKey, record);
        track(browser.__catE2eRecordNavigationIntent?.(record));
        return minted;
      };
      const recordPagehideIntent = (): void => {
        if (navigationIntent === undefined) mintNavigationIntent();
      };
      registerCurrentDocument();
      browser.addEventListener?.(
        "beforeunload",
        (event: unknown) => {
          const minted = mintNavigationIntent();
          queueMicrotask(() => {
            if (
              typeof event === "object" &&
              event !== null &&
              Reflect.get(event, "defaultPrevented") === true
            ) {
              const cancelled = {
                cancelled: true as const,
                documentToken,
                documentLifetimeToken,
                documentUrl: browser.location.href,
                ...minted,
                occurredAt: Date.now(),
              };
              store(navigationIntentStorageKey, cancelled);
              track(browser.__catE2eRecordNavigationIntent?.(cancelled));
            }
          });
        },
        true,
      );
      browser.addEventListener?.("pagehide", recordPagehideIntent, true);
      browser.addEventListener?.(
        "pageshow",
        (event: unknown) => {
          if (
            typeof event !== "object" ||
            event === null ||
            Reflect.get(event, "persisted") !== true
          ) {
            return;
          }
          navigationIntent = undefined;
          intentSequence = 0;
          documentLifetimeToken = crypto.randomUUID();
          registerCurrentDocument();
        },
        true,
      );
      browser.addEventListener?.("cat:request-cancelled", (event: unknown) => {
        const detail = Reflect.get(event as object, "detail");
        const cancellation =
          typeof detail === "object" && detail !== null
            ? Object.freeze(detail)
            : undefined;
        const existing =
          cancellation === undefined
            ? undefined
            : cancellationSnapshots.get(cancellation);
        const snapshot = existing ?? {
          ...(navigationIntent === undefined
            ? {}
            : {
                navigationIntent: {
                  intentSequence: navigationIntent.intentSequence,
                  navigationIntentToken: navigationIntent.navigationIntentToken,
                },
              }),
          recordId: recordId("cancellation"),
        };
        if (cancellation !== undefined && existing === undefined)
          cancellationSnapshots.set(cancellation, snapshot);
        const cancellationRecord = {
          ...(cancellation === undefined ? {} : cancellation),
          documentToken,
          documentUrl: browser.location.href,
          ...(snapshot.navigationIntent === undefined
            ? {}
            : {
                navigationIntentSequence:
                  snapshot.navigationIntent.intentSequence,
                navigationIntentToken:
                  snapshot.navigationIntent.navigationIntentToken,
              }),
          recordId: snapshot.recordId,
        };
        store(cancellationStorageKey, cancellationRecord);
        track(browser.__catE2eRecordCancellation?.(cancellationRecord));
      });
      browser.addEventListener?.(
        "cat:request-cancellation-error",
        (event: unknown) => {
          const detail = Reflect.get(event as object, "detail");
          if (typeof detail !== "object" || detail === null) return;
          const cancellation = Reflect.get(detail, "cancellation");
          const error = Reflect.get(detail, "error");
          if (typeof cancellation !== "object" || cancellation === null) return;
          if (
            typeof error === "object" &&
            error !== null &&
            cancellationErrorRecordIds.has(error)
          ) {
            return;
          }
          const snapshot = cancellationSnapshots.get(cancellation);
          const cancellationErrorRecordId = recordId("cancellation-error");
          const cancellationErrorRecord = {
            ...cancellation,
            ...(snapshot === undefined
              ? {}
              : { cancellationRecordId: snapshot.recordId }),
            documentToken,
            documentUrl: browser.location.href,
            ...(snapshot?.navigationIntent === undefined
              ? {}
              : {
                  navigationIntentSequence:
                    snapshot.navigationIntent.intentSequence,
                  navigationIntentToken:
                    snapshot.navigationIntent.navigationIntentToken,
                }),
            errorName: "ExpectedRequestCancellationError",
            recordId: cancellationErrorRecordId,
          };
          if (typeof error === "object" && error !== null) {
            cancellationRecordIds.set(error, cancellationErrorRecord.recordId);
            cancellationErrorRecordIds.set(error, cancellationErrorRecordId);
          }
          store(cancellationErrorStorageKey, cancellationErrorRecord);
          track(
            browser.__catE2eRecordCancellationError?.(cancellationErrorRecord),
          );
        },
      );
    });
    page.on("console", (message) => {
      const document = snapshotDocument(navigation, page.url());
      const task = consoleDiagnostic(message)
        .then((failure) => {
          record(failure, "console", document);
        })
        .finally(() => diagnosticTasks.delete(task));
      diagnosticTasks.add(task);
    });
    page.on("response", (response) => {
      if (response.status() >= 500) {
        record(
          { kind: "http-5xx", value: `${response.status()} ${response.url()}` },
          "response",
          requestDocuments.get(response.request()) ?? {
            epoch: navigation.documentEpoch,
            url: page.url(),
          },
        );
      }
    });
    page.on("request", (request) => {
      const document = snapshotDocument(
        navigation,
        request.frame()?.url() ?? page.url(),
      );
      requestDocuments.set(request, document);
      requestDocumentTokens.set(request, navigation.activeDocumentToken);
      requestIds.set(request, request.headers()["x-cat-request-id"]);
      if (
        request.frame() === page.mainFrame() &&
        request.resourceType() === "document"
      ) {
        navigation = startMainFrameDocumentNavigation(
          navigation,
          request,
          request.redirectedFrom(),
        );
      }
    });
    page.on("framenavigated", (frame) => {
      if (frame !== page.mainFrame()) return;
      navigation = commitMainFrameDocumentNavigation(navigation);
    });
    page.on("requestfailed", (request) => {
      const type = request.resourceType();
      const failure = request.failure()?.errorText ?? "failed";
      const document = requestDocuments.get(request);
      const navigationTransactionId =
        type === "document"
          ? navigationIdForRequestFailure(navigation, request)
          : navigationIdForRequestFailure(navigation, document?.epoch);
      navigation = failMainFrameDocumentNavigation(navigation, request);
      if (
        [
          "document",
          "fetch",
          "script",
          "stylesheet",
          "websocket",
          "xhr",
        ].includes(type)
      ) {
        const task = request
          .allHeaders()
          .then(
            (headers) =>
              void record(
                {
                  kind:
                    type === "websocket" ? "websocket" : "critical-resource",
                  value: `${type} ${request.url()}: ${failure}`,
                },
                "request",
                document,
                headers["x-cat-request-id"] ?? requestIds.get(request),
                navigationTransactionId,
                Date.now(),
                requestDocumentTokens.get(request),
              ),
          )
          .catch(
            () =>
              void record(
                {
                  kind:
                    type === "websocket" ? "websocket" : "critical-resource",
                  value: `${type} ${request.url()}: ${failure}`,
                },
                "request",
                document,
                requestIds.get(request),
                navigationTransactionId,
                Date.now(),
                requestDocumentTokens.get(request),
              ),
          )
          .finally(() => diagnosticTasks.delete(task));
        diagnosticTasks.add(task);
      }
    });
    page.on("websocket", (socket) => {
      const document = snapshotDocument(navigation, page.url());
      socket.on("socketerror", (error) => {
        record(
          { kind: "websocket", value: `${socket.url()}: ${error}` },
          "websocket",
          document,
        );
      });
    });

    await use(page);
    await page.waitForTimeout(0);
    await Promise.all([...diagnosticTasks]);
    const browserEvents = await page.evaluate(() =>
      Reflect.get(globalThis, "__CAT_E2E_DIAGNOSTICS__"),
    );
    if (Array.isArray(browserEvents)) {
      for (const event of browserEvents) {
        if (isDiagnosticEvent(event)) {
          record(
            {
              kind: "app-error",
              value: `${event.code}: ${event.message}`,
            },
            "browser-event",
          );
        }
      }
    }
    await replayStoredDiagnostics();
    await page.evaluate(async () => {
      const pending = Reflect.get(
        globalThis,
        "__CAT_E2E_PENDING_CANCELLATION_RECORDS__",
      );
      if (pending instanceof Set) await Promise.all([...pending]);
    });
    await replayStoredDiagnostics();
    for (const pageError of pageErrors.values()) {
      const cancellation =
        pageError.cancellationRecordId === undefined
          ? undefined
          : cancellationErrors.get(pageError.cancellationRecordId);
      const matchingCancellation =
        cancellation?.documentToken === pageError.documentToken
          ? cancellation
          : undefined;
      const navigationTransactionId =
        matchingCancellation?.navigationIntentToken === undefined
          ? undefined
          : navigationIdForDocumentEvent(
              navigation,
              matchingCancellation.navigationIntentToken,
            );
      const boundCancellation =
        matchingCancellation === undefined
          ? undefined
          : {
              ...matchingCancellation,
              ...(navigationTransactionId === undefined
                ? {}
                : { navigationTransactionId }),
            };
      const failure = record(
        {
          errorName: pageError.errorName,
          kind: "page-error",
          value: pageError.value,
        },
        "page",
        documents.get(pageError.documentToken) ?? {
          epoch: navigation.documentEpoch,
          url: pageError.documentUrl,
        },
        undefined,
        navigationTransactionId,
        pageError.occurredAt,
        pageError.documentToken,
      );
      if (failure !== undefined && boundCancellation !== undefined)
        pageErrorCancellations.set(failure, boundCancellation);
    }
    const consumedCancellationRecordIds = new Set<string>();
    await assertDiagnostics(
      failures.filter(
        (failure) =>
          !isReplacedNavigationAbort(
            failure,
            navigation.committedNavigationIds,
          ) &&
          !consumeControlledCancellation(
            failure,
            cancellations,
            consumedCancellationRecordIds,
          ) &&
          !consumeNavigationOwnedCancellationPageError(
            failure,
            pageErrorCancellations.get(failure),
            navigation.committedNavigationIds,
            consumedCancellationRecordIds,
          ),
      ),
      expectedDiagnostics,
      testInfo,
    );
  },

  // oxlint-disable-next-line no-empty-pattern
  refs: async ({}, use) => {
    await use(loadRefs());
  },

  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  editorPage: async ({ page }, use) => {
    await use(new EditorPage(page));
  },

  qaReviewPage: async ({ page }, use) => {
    await use(new QaReviewPage(page));
  },

  projectUrl: async ({ refs }, use) => {
    await use(`/project/${refs["project"]}`);
  },
});

export { expect } from "@playwright/test";
