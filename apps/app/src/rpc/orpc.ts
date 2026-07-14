import type { AppRouter } from "@cat/app-api/orpc/router";
import { createORPCClient, onError } from "@orpc/client";
import { RPCLink, type LinkFetchInterceptorOptions } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";

import { clientLogger as logger } from "#/utils/logger.ts";

import {
  ExpectedRequestCancellationError,
  expectedRequestCancellation,
  isExpectedNavigationCancellation,
  isExpectedRequestCancellationFor,
  RequestCancellationRegistry,
  requestIdHeader,
  type ExpectedRequestCancellation,
} from "./request-cancellation.ts";

const cancellationStateKey = Symbol.for("cat.orpc.request-cancellation-state");

type CancellationState = {
  errorListenerInstalled: boolean;
  navigationListenersInstalled: boolean;
  reportedCancellationErrors: WeakSet<object>;
  rejectionListenerInstalled: boolean;
  registry: RequestCancellationRegistry;
};

type FetchErrorOptions = LinkFetchInterceptorOptions<Record<never, never>> & {
  next: () => Promise<Response>;
};

const responseMetadataProperties = new Set([
  "headers",
  "ok",
  "redirected",
  "status",
  "statusText",
  "type",
  "url",
]);

const responseBodyReaders = new Set([
  "arrayBuffer",
  "blob",
  "formData",
  "json",
  "text",
]);

type ResponseCancellationBoundary = {
  cancellation: ExpectedRequestCancellation | undefined;
  settled: boolean;
};

type ResponseBranchState = {
  consumerCancelled: boolean;
};

const cancellationBoundaryError = (
  error: unknown,
  registry: RequestCancellationRegistry,
  id: string,
  boundary: ResponseCancellationBoundary,
): unknown => {
  const cancellation = boundary.cancellation ?? registry.expected(id);
  return cancellation === undefined || cancellation.kind === "consumer"
    ? error
    : new ExpectedRequestCancellationError(cancellation);
};

const responseWithCancellationBoundary = (
  response: Response,
  registry: RequestCancellationRegistry,
  id: string,
  settle: () => void,
  metadata: Response = response,
  boundary: ResponseCancellationBoundary = {
    cancellation: undefined,
    settled: false,
  },
  branch: ResponseBranchState = {
    consumerCancelled: false,
  },
): Response => {
  const sourceBody = response.body;
  if (sourceBody === null) {
    if (!boundary.settled) {
      boundary.settled = true;
      settle();
    }
    return response;
  }

  const reader = sourceBody.getReader();
  const settleOnce = (): void => {
    boundary.cancellation ??= registry.expected(id);
    if (boundary.settled) return;
    boundary.settled = true;
    settle();
  };
  const body = new ReadableStream<Uint8Array>(
    {
      async cancel(reason): Promise<void> {
        const cancellation = registry.cancel(id, "consumer");
        if (cancellation !== undefined) reportCancellation(cancellation);
        branch.consumerCancelled = true;
        try {
          await reader.cancel(reason);
        } catch {
          // The consumer explicitly gave up this branch, so source cancellation
          // failures cannot become application diagnostics.
        } finally {
          settleOnce();
        }
      },
      async pull(controller): Promise<void> {
        try {
          const result = await reader.read();
          if (result.done) {
            settleOnce();
            controller.close();
            return;
          }
          controller.enqueue(result.value);
        } catch (error) {
          if (branch.consumerCancelled || registry.expected(id) !== undefined) {
            settleOnce();
            controller.close();
            return;
          }
          settleOnce();
          controller.error(error);
        }
      },
    },
    { highWaterMark: 0 },
  );
  const wrapped = new Response(body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });

  return new Proxy(wrapped, {
    get(target, property) {
      if (property === "clone")
        return (): Response =>
          responseWithCancellationBoundary(
            target.clone(),
            registry,
            id,
            settle,
            metadata,
            boundary,
          );
      if (
        typeof property === "string" &&
        responseMetadataProperties.has(property)
      )
        return Reflect.get(metadata, property, metadata);
      if (property === "bytes") {
        const nativeBytes = Reflect.get(target, property, target);
        const bytes =
          typeof nativeBytes === "function"
            ? nativeBytes.bind(target)
            : async (): Promise<Uint8Array> =>
                new Uint8Array(await target.arrayBuffer());
        return (...args: unknown[]): Promise<unknown> =>
          Promise.resolve(Reflect.apply(bytes, target, args)).catch(
            (error: unknown) => {
              throw cancellationBoundaryError(error, registry, id, boundary);
            },
          );
      }
      const value = Reflect.get(target, property, target);
      if (
        typeof property === "string" &&
        responseBodyReaders.has(property) &&
        typeof value === "function"
      ) {
        return (...args: unknown[]): Promise<unknown> =>
          Promise.resolve(Reflect.apply(value, target, args)).catch(
            (error: unknown) => {
              throw cancellationBoundaryError(error, registry, id, boundary);
            },
          );
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
};

const isCancellationState = (value: unknown): value is CancellationState =>
  typeof value === "object" &&
  value !== null &&
  typeof Reflect.get(value, "navigationListenersInstalled") === "boolean" &&
  typeof Reflect.get(value, "registry") === "object" &&
  Reflect.get(value, "registry") !== null &&
  typeof Reflect.get(Reflect.get(value, "registry"), "register") ===
    "function" &&
  typeof Reflect.get(Reflect.get(value, "registry"), "cancel") === "function" &&
  typeof Reflect.get(Reflect.get(value, "registry"), "cancelActive") ===
    "function" &&
  typeof Reflect.get(Reflect.get(value, "registry"), "expected") ===
    "function" &&
  typeof Reflect.get(Reflect.get(value, "registry"), "settle") === "function";

const localCancellationState: CancellationState = {
  errorListenerInstalled: false,
  navigationListenersInstalled: false,
  reportedCancellationErrors: new WeakSet(),
  rejectionListenerInstalled: false,
  registry: new RequestCancellationRegistry(),
};

const cancellationState = (): CancellationState => {
  if (typeof window === "undefined") return localCancellationState;
  const existing = Reflect.get(window, cancellationStateKey);
  if (isCancellationState(existing)) {
    if (typeof Reflect.get(existing, "errorListenerInstalled") !== "boolean")
      Reflect.set(existing, "errorListenerInstalled", false);
    if (
      typeof Reflect.get(existing, "rejectionListenerInstalled") !== "boolean"
    )
      Reflect.set(existing, "rejectionListenerInstalled", false);
    if (
      !(Reflect.get(existing, "reportedCancellationErrors") instanceof WeakSet)
    )
      Reflect.set(
        existing,
        "reportedCancellationErrors",
        new WeakSet<object>(),
      );
    return existing;
  }
  const state: CancellationState = {
    errorListenerInstalled: false,
    navigationListenersInstalled: false,
    reportedCancellationErrors: new WeakSet(),
    rejectionListenerInstalled: false,
    registry: new RequestCancellationRegistry(),
  };
  Reflect.set(window, cancellationStateKey, state);
  return state;
};

const reportCancellation = (
  cancellation: ExpectedRequestCancellation,
): void => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("cat:request-cancelled", { detail: cancellation }),
  );
};

const reportCancellationError = (
  cancellation: ExpectedRequestCancellation,
  error: unknown,
): void => {
  if (typeof window === "undefined") return;
  if (typeof error === "object" && error !== null) {
    const reported = cancellationState().reportedCancellationErrors;
    if (reported.has(error)) return;
    reported.add(error);
  }
  window.dispatchEvent(
    new CustomEvent("cat:request-cancellation-error", {
      detail: { cancellation, error },
    }),
  );
};

const installNavigationCancellationListeners = (): void => {
  if (typeof window === "undefined") return;
  const state = cancellationState();
  if (!state.navigationListenersInstalled) {
    state.navigationListenersInstalled = true;
    const cancelNavigationRequests = (): void => {
      for (const cancellation of state.registry.cancelActive("navigation")) {
        reportCancellation(cancellation);
      }
    };
    window.addEventListener("beforeunload", cancelNavigationRequests, {
      capture: true,
    });
    window.addEventListener("pagehide", cancelNavigationRequests, {
      capture: true,
    });
    window.addEventListener(
      "pageshow",
      () => {
        // A restored document keeps the same registry and only needs its listeners.
        cancellationState();
      },
      { capture: true },
    );
  }
  if (!state.rejectionListenerInstalled) {
    state.rejectionListenerInstalled = true;
    window.addEventListener("unhandledrejection", (event) => {
      if (isExpectedNavigationCancellation(event.reason)) {
        const cancellation = expectedRequestCancellation(event.reason);
        if (cancellation === undefined) return;
        reportCancellationError(cancellation, event.reason);
        event.preventDefault();
      }
    });
  }
  if (!state.errorListenerInstalled) {
    state.errorListenerInstalled = true;
    window.addEventListener("error", (event) => {
      if (isExpectedNavigationCancellation(event.error)) {
        const cancellation = expectedRequestCancellation(event.error);
        if (cancellation === undefined) return;
        reportCancellationError(cancellation, event.error);
        event.preventDefault();
      }
    });
  }
};

installNavigationCancellationListeners();

const requestFetch = async (
  request: Request,
  init: RequestInit,
): Promise<Response> => {
  const id = request.headers.get(requestIdHeader) ?? crypto.randomUUID();
  const headers = new Headers(request.headers);
  headers.set(requestIdHeader, id);
  const instrumentedRequest = new Request(request, { headers });
  const signal = instrumentedRequest.signal;
  const registry = cancellationState().registry;
  registry.register(id, instrumentedRequest.url);
  const cancelForSignal = (): ExpectedRequestCancellation | undefined => {
    const cancellation = registry.cancel(id, "signal");
    if (cancellation !== undefined) reportCancellation(cancellation);
    return cancellation;
  };
  if (signal.aborted) {
    const cancellation = cancelForSignal();
    registry.settle(id);
    if (cancellation === undefined)
      throw new Error(
        "Registered RPC request was not available for cancellation",
      );
    throw new ExpectedRequestCancellationError(cancellation);
  }
  signal.addEventListener("abort", cancelForSignal, { once: true });
  const settle = (): void => {
    signal.removeEventListener("abort", cancelForSignal);
    registry.settle(id);
  };
  let responseReceived = false;
  try {
    const response = await fetch(instrumentedRequest, init);
    responseReceived = true;
    return responseWithCancellationBoundary(response, registry, id, settle);
  } catch (error) {
    const cancellation = registry.expected(id);
    if (cancellation !== undefined)
      throw new ExpectedRequestCancellationError(cancellation);
    throw error;
  } finally {
    if (!responseReceived) settle();
  }
};

const getCsrfToken = (): string | undefined => {
  const match = document.cookie.match(/(?:^|; )csrfToken=([^;]*)/);
  return match?.[1];
};

const rpcOrigin =
  typeof window === "undefined"
    ? "http://localhost:3000"
    : window.location.origin;

const link = new RPCLink({
  url: new URL("/api/rpc", rpcOrigin),
  headers: () => {
    const csrfToken = getCsrfToken();
    const headers: Record<string, string> = {
      [requestIdHeader]: crypto.randomUUID(),
    };
    if (csrfToken) headers["x-csrf-token"] = csrfToken;
    return headers;
  },
  fetch: requestFetch,
  adapterInterceptors: [
    onError<Promise<Response>, FetchErrorOptions, []>((error, options) => {
      if (isExpectedRequestCancellationFor(error, options.request)) return;
      const requestId = options.request.headers.get(requestIdHeader);
      if (
        requestId !== null &&
        cancellationState().registry.expected(requestId)?.kind === "consumer"
      ) {
        return;
      }
      logger
        .child({ component: "web" })
        .error("Error when orpc", { error: error });
    }),
  ],
});

export const orpc: RouterClient<AppRouter> = createORPCClient(link);
