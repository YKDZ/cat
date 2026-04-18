/**
 * Unit tests for registerDomainEventHandlers — element:created wiring.
 *
 * Validates that when registerDomainEventHandlers is called and an
 * element:created event is emitted on domainEventBus, runAutoTranslatePipeline
 * is called with the correct payload.
 */

import type { DrizzleClient } from "@cat/domain";

import { domainEvent, domainEventBus } from "@cat/domain";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Mock runAutoTranslatePipeline to avoid real DB/AI calls.
vi.mock("../run-auto-translate-pipeline", () => ({
  runAutoTranslatePipeline: vi.fn().mockResolvedValue(undefined),
}));

import { registerDomainEventHandlers } from "../register-domain-event-handlers";
import { runAutoTranslatePipeline } from "../run-auto-translate-pipeline";

const mockPipeline = vi.mocked(runAutoTranslatePipeline);

// A fake DB handle — registerDomainEventHandlers only stores a reference
// to pass into pipeline calls; no actual DB calls are made in these tests.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const fakeDb = null as unknown as DrizzleClient;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  // No cleanup needed: vi.mock + vi.clearAllMocks resets call history
});

describe("registerDomainEventHandlers — element:created wiring", () => {
  test("element:created event triggers runAutoTranslatePipeline with correct payload", async () => {
    registerDomainEventHandlers(fakeDb);

    const payload = {
      projectId: "project-uuid-1",
      documentId: "document-uuid-1",
      elementIds: [1, 2, 3],
    };

    await domainEventBus.publish(domainEvent("element:created", payload));

    // The handler fires asynchronously (void + .catch), give the microtask queue
    // a chance to flush.
    await vi.waitFor(() => {
      expect(mockPipeline).toHaveBeenCalledTimes(1);
    });

    expect(mockPipeline).toHaveBeenCalledWith(
      { db: fakeDb },
      {
        projectId: payload.projectId,
        documentId: payload.documentId,
        elementIds: payload.elementIds,
      },
    );
  });

  test("element:created payload is forwarded exactly (no field dropped or renamed)", async () => {
    registerDomainEventHandlers(fakeDb);

    const payload = {
      projectId: "project-uuid-2",
      documentId: "document-uuid-2",
      elementIds: [42],
    };

    await domainEventBus.publish(domainEvent("element:created", payload));

    await vi.waitFor(() => {
      expect(mockPipeline).toHaveBeenCalled();
    });

    const [ctxArg, inputArg] = mockPipeline.mock.calls[0];
    expect(ctxArg).toEqual({ db: fakeDb });
    expect(inputArg).toEqual(payload);
  });

  test("registerDomainEventHandlers is idempotent — second call does not double-register", async () => {
    // First call already registered by the test above (within the same vitest worker);
    // calling again should be a no-op.
    registerDomainEventHandlers(fakeDb);
    registerDomainEventHandlers(fakeDb);

    const payload = {
      projectId: "project-uuid-3",
      documentId: "document-uuid-3",
      elementIds: [7],
    };

    await domainEventBus.publish(domainEvent("element:created", payload));

    await vi.waitFor(() => {
      // Should only be called once even though registerDomainEventHandlers was
      // called multiple times.
      expect(mockPipeline).toHaveBeenCalledTimes(1);
    });
  });
});
