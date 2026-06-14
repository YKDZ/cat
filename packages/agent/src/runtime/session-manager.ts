import type { BlackboardSnapshot } from "@cat/graph";
import type { AgentSessionMetadata, ParsedAgentDefinition } from "@cat/shared";

import {
  completeAgentSession,
  createAgentRun,
  createAgentSession,
  executeCommand,
  executeQuery,
  finishAgentRun,
  getDbHandle,
  getAgentDefinitionByInternalId,
  getAgentSessionByExternalId,
  loadAgentRunSnapshot,
  saveAgentRunSnapshot,
} from "@cat/domain";
import { BlackboardSnapshotSchema } from "@cat/graph";
import { AgentSessionMetadataSchema } from "@cat/shared";

import { buildAgentDAG } from "../dag/agent-dag-builder.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Parameters for SessionManager.createSession().
 */
export interface CreateSessionParams {
  /** Agent definition external UUID */
  agentDefinitionId: string;
  /** User external UUID */
  userId: string;
  /** Project external UUID (optional) */
  projectId?: string;
  /** Session-scoped business context metadata */
  metadata?: AgentSessionMetadata;
  /** Initial user message (optional) */
  initialMessage?: string;
  /** Deduplication key (for idempotency) */
  deduplicationKey?: string;
}

/**
 * Return value of SessionManager.createSession().
 */
export interface CreateSessionResult {
  /** External UUID of the new agentSession */
  sessionId: string;
  /** External UUID of the new agentRun */
  runId: string;
}

/**
 * Loaded session state for use by AgentRuntime.
 */
export interface SessionState {
  /** agentSession external UUID */
  sessionId: string;
  /** agentSession internal ID */
  sessionDbId: number;
  /** agentDefinition internal ID */
  agentDefinitionDbId: number;
  /** Parsed agent definition */
  agentDefinition: ParsedAgentDefinition;
  /** Current agentRun external UUID */
  runId: string;
  /** Project external UUID linked to the current session */
  projectId: string | null;
  /** Parsed session metadata */
  sessionMetadata: AgentSessionMetadata | null;
  /** Current run internal ID */
  currentRunId: number | null;
  /** Blackboard snapshot (if any) */
  blackboardSnapshot: BlackboardSnapshot | null;
}

// ─── SessionManager ───────────────────────────────────────────────────────────

/**
 * Session lifecycle manager: encapsulates create, load, persist, and complete operations for Agent Sessions and Runs.
 */
export class SessionManager {
  /**
   * Create a new AgentSession and AgentRun, and initialize the Blackboard.
   *
   * @param params - Create session parameters
   * @returns - Session ID and run ID
   */
  async createSession(
    params: CreateSessionParams,
  ): Promise<CreateSessionResult> {
    const { client: db } = await getDbHandle();

    // 1. Create agentSession
    const sessionResult = await executeCommand({ db }, createAgentSession, {
      agentDefinitionId: params.agentDefinitionId,
      userId: params.userId,
      projectId: params.projectId ?? params.metadata?.projectId,
      metadata: {
        ...params.metadata,
        ...(params.projectId ? { projectId: params.projectId } : {}),
      },
    });

    // 2. Create agentRun with GraphDefinition
    const graphDef = buildAgentDAG();
    const runResult = await executeCommand({ db }, createAgentRun, {
      sessionId: sessionResult.sessionId,
      graphDefinition: graphDef,
      deduplicationKey: params.deduplicationKey,
    });

    // 3. If initial message, save it to the Blackboard snapshot
    if (params.initialMessage) {
      const initialData = {
        messages: [{ role: "user", content: params.initialMessage }],
        started_at: new Date().toISOString(),
        current_turn: 0,
      };
      await executeCommand({ db }, saveAgentRunSnapshot, {
        externalId: runResult.runId,
        snapshot: initialData,
      });
    }

    return {
      sessionId: sessionResult.sessionId,
      runId: runResult.runId,
    };
  }

  /**
   * Load session state (including agent definition and current Blackboard snapshot).
   *
   * @param sessionId - agentSession external UUID
   * @param runId - agentRun external UUID
   * @returns - Loaded SessionState
   */
  async loadSession(sessionId: string, runId: string): Promise<SessionState> {
    const { client: db } = await getDbHandle();

    // Load session
    const session = await executeQuery({ db }, getAgentSessionByExternalId, {
      externalId: sessionId,
    });

    if (!session) {
      throw new Error(`AgentSession not found: ${sessionId}`);
    }

    const sessionMetadataResult = AgentSessionMetadataSchema.safeParse(
      session.metadata,
    );
    const sessionMetadata = sessionMetadataResult.success
      ? sessionMetadataResult.data
      : null;

    // Load agent definition
    const definition = await executeQuery(
      { db },
      getAgentDefinitionByInternalId,
      { id: session.agentDefinitionId },
    );

    if (!definition) {
      throw new Error(
        `AgentDefinition not found: id=${session.agentDefinitionId}`,
      );
    }

    // Build ParsedAgentDefinition from the DB record
    const agentDefinition: ParsedAgentDefinition = {
      metadata: {
        id: definition.definitionId,
        name: definition.name,
        version: definition.version,
        icon: definition.icon ?? undefined,
        type: definition.type,
        llm: definition.llmConfig ?? undefined,
        tools: definition.tools ?? [],
        promptConfig: definition.promptConfig ?? undefined,
        constraints: definition.constraints ?? undefined,
        securityPolicy: definition.securityPolicy ?? undefined,
        orchestration: definition.orchestration ?? undefined,
      },
      content: definition.content,
    };

    // Load Blackboard snapshot
    const rawSnapshot = await executeQuery({ db }, loadAgentRunSnapshot, {
      externalId: runId,
    });

    const blackboardSnapshot: BlackboardSnapshot | null = rawSnapshot
      ? BlackboardSnapshotSchema.parse({
          runId,
          version: 0,
          data: rawSnapshot,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      : null;

    return {
      sessionId,
      sessionDbId: session.id,
      agentDefinitionDbId: session.agentDefinitionId,
      agentDefinition,
      runId,
      projectId: session.projectId ?? sessionMetadata?.projectId ?? null,
      sessionMetadata,
      currentRunId: session.currentRunId,
      blackboardSnapshot,
    };
  }

  /**
   * Persist Blackboard snapshot to the database.
   *
   * @param runId - agentRun external UUID
   * @param snapshot - Blackboard data snapshot
   */
  async saveSnapshot(
    runId: string,
    snapshot: Record<string, unknown>,
  ): Promise<void> {
    const { client: db } = await getDbHandle();
    await executeCommand({ db }, saveAgentRunSnapshot, {
      externalId: runId,
      snapshot,
    });
  }

  /**
   * Mark AgentSession and AgentRun as terminal state.
   *
   * @param sessionId - agentSession external UUID
   * @param runId - agentRun external UUID
   * @param status - Final status
   */
  async completeSession(
    sessionId: string,
    runId: string,
    status: "COMPLETED" | "FAILED",
  ): Promise<void> {
    const { client: db } = await getDbHandle();
    await Promise.all([
      executeCommand({ db }, completeAgentSession, {
        sessionId,
        finalStatus: status,
      }),
      executeCommand({ db }, finishAgentRun, {
        runId,
        status: status === "COMPLETED" ? "completed" : "failed",
      }),
    ]);
  }
}
