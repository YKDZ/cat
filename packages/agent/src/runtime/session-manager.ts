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
 * @zh SessionManager 创建会话的参数。
 * @en Parameters for SessionManager.createSession().
 */
export interface CreateSessionParams {
  /** @zh Agent 定义外部 UUID @en Agent definition external UUID */
  agentDefinitionId: string;
  /** @zh 用户外部 UUID @en User external UUID */
  userId: string;
  /** @zh 项目外部 UUID（可选）@en Project external UUID (optional) */
  projectId?: string;
  /** @zh 会话级业务上下文元数据 @en Session-scoped business context metadata */
  metadata?: AgentSessionMetadata;
  /** @zh 初始用户消息（可选）@en Initial user message (optional) */
  initialMessage?: string;
  /** @zh 去重键（用于幂等性）@en Deduplication key (for idempotency) */
  deduplicationKey?: string;
}

/**
 * @zh SessionManager.createSession() 的返回值。
 * @en Return value of SessionManager.createSession().
 */
export interface CreateSessionResult {
  /** @zh 新创建的 agentSession 外部 UUID @en External UUID of the new agentSession */
  sessionId: string;
  /** @zh 新创建的 agentRun 外部 UUID @en External UUID of the new agentRun */
  runId: string;
}

/**
 * @zh 已加载的 Session 状态，供 AgentRuntime 使用。
 * @en Loaded session state for use by AgentRuntime.
 */
export interface SessionState {
  /** @zh agentSession 外部 UUID @en agentSession external UUID */
  sessionId: string;
  /** @zh agentSession 内部 ID @en agentSession internal ID */
  sessionDbId: number;
  /** @zh agentDefinition 内部 ID @en agentDefinition internal ID */
  agentDefinitionDbId: number;
  /** @zh 已解析的 Agent 定义 @en Parsed agent definition */
  agentDefinition: ParsedAgentDefinition;
  /** @zh 当前 agentRun 外部 UUID @en Current agentRun external UUID */
  runId: string;
  /** @zh 当前会话关联的项目外部 UUID @en Project external UUID linked to the current session */
  projectId: string | null;
  /** @zh 解析后的会话元数据 @en Parsed session metadata */
  sessionMetadata: AgentSessionMetadata | null;
  /** @zh 当前运行内部 ID @en Current run internal ID */
  currentRunId: number | null;
  /** @zh Blackboard 快照（若已有）@en Blackboard snapshot (if any) */
  blackboardSnapshot: BlackboardSnapshot | null;
}

// ─── SessionManager ───────────────────────────────────────────────────────────

/**
 * @zh Session 生命周期管理器：封装 Agent Session 和 Run 的创建、加载、持久化和完成操作。
 * @en Session lifecycle manager: encapsulates create, load, persist, and complete operations for Agent Sessions and Runs.
 */
export class SessionManager {
  /**
   * @zh 创建新的 AgentSession 和 AgentRun，并初始化 Blackboard。
   * @en Create a new AgentSession and AgentRun, and initialize the Blackboard.
   *
   * @param params - {@zh 创建会话参数} {@en Create session parameters}
   * @returns - {@zh 会话 ID 和运行 ID} {@en Session ID and run ID}
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
   * @zh 加载 Session 状态（含 Agent 定义和当前 Blackboard 快照）。
   * @en Load session state (including agent definition and current Blackboard snapshot).
   *
   * @param sessionId - {@zh agentSession 外部 UUID} {@en agentSession external UUID}
   * @param runId - {@zh agentRun 外部 UUID} {@en agentRun external UUID}
   * @returns - {@zh 已加载的 SessionState} {@en Loaded SessionState}
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
   * @zh 将 Blackboard 快照持久化到数据库。
   * @en Persist Blackboard snapshot to the database.
   *
   * @param runId - {@zh agentRun 外部 UUID} {@en agentRun external UUID}
   * @param snapshot - {@zh Blackboard 数据快照} {@en Blackboard data snapshot}
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
   * @zh 将 AgentSession 和 AgentRun 标记为终止态。
   * @en Mark AgentSession and AgentRun as terminal state.
   *
   * @param sessionId - {@zh agentSession 外部 UUID} {@en agentSession external UUID}
   * @param runId - {@zh agentRun 外部 UUID} {@en agentRun external UUID}
   * @param status - {@zh 最终状态} {@en Final status}
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
