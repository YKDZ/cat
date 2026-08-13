import type { DbHandle, RecallDerivationClaim } from "@cat/domain";
import type { PluginManager } from "@cat/plugin-core";
import type {
  NormalizedLanguageId,
  RecallDerivationBlocker,
} from "@cat/shared";

export type RecallDerivationTargetKind = "MEMORY_ITEM" | "TERM_CONCEPT";

export type LeasedRecallDerivationClaim = Omit<
  RecallDerivationClaim,
  "languageId"
> & {
  languageId: NormalizedLanguageId;
  leaseToken: string;
};

export type RecallDerivationProbeResult = Readonly<{
  committed: boolean;
}>;

export type RecallDerivationAdapter<
  TargetKind extends RecallDerivationTargetKind,
> = Readonly<{
  targetKind: TargetKind;
  deriveAndPublish: (input: {
    db: DbHandle;
    pluginManager: PluginManager;
    claim: LeasedRecallDerivationClaim;
    signal?: AbortSignal | undefined;
  }) => Promise<{
    status: "PUBLISHED" | "STALE";
    reconciled?: boolean | undefined;
  }>;
  probeCurrentDependencies: (input: {
    db: DbHandle;
    pluginManager: PluginManager;
    languageIds?: readonly NormalizedLanguageId[] | undefined;
    timeoutMs?: number | undefined;
    signal?: AbortSignal | undefined;
  }) => Promise<RecallDerivationProbeResult>;
}>;

export class RecallDerivationAdapterError extends Error {
  public readonly blocker: RecallDerivationBlocker;
  public readonly blockers: RecallDerivationBlocker[];
  public readonly committed: boolean;

  public constructor(
    blockers: RecallDerivationBlocker | RecallDerivationBlocker[],
    cause?: unknown,
    committed = false,
  ) {
    const normalized = Array.isArray(blockers) ? blockers : [blockers];
    const [blocker] = normalized;
    if (!blocker)
      throw new TypeError("Adapter failure must include a blocker.");
    super(blocker.message, cause === undefined ? undefined : { cause });
    this.name = "RecallDerivationAdapterError";
    this.blocker = blocker;
    this.blockers = normalized;
    this.committed = committed;
  }
}
