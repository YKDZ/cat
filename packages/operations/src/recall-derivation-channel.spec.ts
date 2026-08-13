import type { ScopedRecallDerivationStateView } from "@cat/domain";
import {
  CanonicalInputVersionSchema,
  NormalizedLanguageIdSchema,
  RecallDerivationVersionSchema,
} from "@cat/shared";
import { describe, expect, it } from "vitest";

import { assessScopedRecallDerivation } from "./recall-derivation-channel.ts";

const version = RecallDerivationVersionSchema.parse(`sha256:${"a".repeat(64)}`);
const canonical = CanonicalInputVersionSchema.parse(`sha256:${"b".repeat(64)}`);

const state = (
  overrides: Partial<ScopedRecallDerivationStateView> = {},
): ScopedRecallDerivationStateView => ({
  targetId: "42",
  stateId: 1,
  languageId: NormalizedLanguageIdSchema.parse("en"),
  status: "FRESH",
  demandRevision: 1,
  blocker: null,
  canonicalInputVersion: canonical,
  requiredDerivationVersion: version,
  currentCanonicalInputVersion: canonical,
  currentDerivationVersion: version,
  ...overrides,
});

describe("scoped Recall Derivation channel assessment", () => {
  it("distinguishes no scoped assets from fresh derivation", () => {
    expect(assessScopedRecallDerivation([], "MEMORY_ITEM", version)).toEqual({
      status: "NO_SCOPED_ASSETS",
    });
    expect(
      assessScopedRecallDerivation([state()], "MEMORY_ITEM", version),
    ).toEqual({ status: "FRESH" });
  });

  it("projects missing state without fabricating a demand revision", () => {
    expect(
      assessScopedRecallDerivation(
        [
          state({
            stateId: null,
            status: null,
            demandRevision: null,
            canonicalInputVersion: null,
            requiredDerivationVersion: null,
            currentCanonicalInputVersion: null,
            currentDerivationVersion: null,
          }),
        ],
        "MEMORY_ITEM",
        version,
      ),
    ).toMatchObject({
      status: "BLOCKED",
      blocker: {
        reason: "RECALL_DERIVATION_PENDING",
        affectedTargets: [{ targetId: "42", languageId: "en" }],
      },
    });
  });

  it("distinguishes stale versions from legal empty candidates", () => {
    expect(
      assessScopedRecallDerivation(
        [state({ currentDerivationVersion: null })],
        "MEMORY_ITEM",
        version,
      ),
    ).toMatchObject({
      status: "BLOCKED",
      blocker: {
        reason: "RECALL_DERIVATION_STALE",
        requiredDerivationVersion: version,
        currentDerivationVersion: null,
      },
    });
  });
});
