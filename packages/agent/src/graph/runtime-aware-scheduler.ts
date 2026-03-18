import type { Checkpointer } from "@/graph/checkpointer";
import type { EventBus } from "@/graph/event-bus";
import type { AgentEvent } from "@/graph/events";
import type { ExecutorPool } from "@/graph/executor-pool";
import type { GraphRegistry } from "@/graph/graph-registry";
import type { NodeRegistry } from "@/graph/node-registry";
import type { Scheduler, SchedulerStartOptions } from "@/graph/scheduler";
import type { RunId } from "@/graph/types";
import type {
  ResolveRuntimeForSessionParams,
  ResolvedGraphRuntimeContext,
  RuntimeResolutionService,
} from "@/runtime/runtime-resolver";

import { withRuntimeRefMetadata } from "@/runtime/runtime-ref";

export type RuntimeAwareSchedulerStartOptions = SchedulerStartOptions & {
  resolvedRuntime?: ResolvedGraphRuntimeContext;
  resolveRuntimeForSession?: ResolveRuntimeForSessionParams;
};

type RecoverableScheduler = Scheduler & {
  hasRun: (runId: RunId) => boolean;
  handleHumanInputReceived: (event: AgentEvent) => Promise<void>;
  handleToolConfirmResponse: (event: AgentEvent) => Promise<void>;
};

export class RuntimeAwareScheduler {
  private readonly unsubscribeFns: Array<() => void> = [];

  constructor(
    private readonly scheduler: RecoverableScheduler,
    private readonly runtimeResolver: RuntimeResolutionService,
    subscribeToRecoveryEvents = true,
  ) {
    if (subscribeToRecoveryEvents) {
      this.unsubscribeFns.push(
        this.scheduler.eventBus.subscribe(
          "human:input:received",
          this.onHumanInputReceived,
        ),
      );
      this.unsubscribeFns.push(
        this.scheduler.eventBus.subscribe(
          "tool:confirm:response",
          this.onToolConfirmResponse,
        ),
      );
    }
  }

  dispose = (): void => {
    for (const unsubscribe of this.unsubscribeFns) {
      unsubscribe();
    }
    this.unsubscribeFns.length = 0;
  };

  start = async (
    graphId: string,
    input: Record<string, unknown>,
    options?: RuntimeAwareSchedulerStartOptions,
  ): Promise<RunId> => {
    const resolvedRuntime = await this.getResolvedRuntime(options);
    const schedulerOptions: SchedulerStartOptions = {
      sessionId: options?.sessionId,
      llmProvider: resolvedRuntime?.llmProvider ?? options?.llmProvider,
      tools: resolvedRuntime?.tools ?? options?.tools,
      systemPrompt: resolvedRuntime?.systemPrompt ?? options?.systemPrompt,
      messages: options?.messages,
      metadata: withRuntimeRefMetadata({
        sessionId: options?.sessionId,
        runtimeRef: resolvedRuntime?.runtimeRef,
        metadata: options?.metadata,
      }),
    };

    return this.scheduler.start(graphId, input, schedulerOptions);
  };

  pause = async (runId: RunId): Promise<void> => {
    await this.scheduler.pause(runId);
  };

  recover = async (runId: RunId): Promise<void> => {
    const runtime = await this.runtimeResolver.resolveForRun({ runId });
    await this.scheduler.recover(runId, {
      runtime: {
        llmProvider: runtime.llmProvider,
        tools: runtime.tools,
        systemPrompt: runtime.systemPrompt,
      },
    });
  };

  resume = async (runId: RunId): Promise<void> => {
    await this.recover(runId);
    await this.scheduler.resume(runId);
  };

  private getResolvedRuntime = async (
    options?: RuntimeAwareSchedulerStartOptions,
  ): Promise<ResolvedGraphRuntimeContext | null> => {
    if (options?.resolvedRuntime) {
      return options.resolvedRuntime;
    }

    if (options?.resolveRuntimeForSession) {
      return this.runtimeResolver.resolveForSession(
        options.resolveRuntimeForSession,
      );
    }

    return null;
  };

  private onHumanInputReceived = async (event: AgentEvent): Promise<void> => {
    if (this.scheduler.hasRun(event.runId)) return;

    try {
      await this.recover(event.runId);
    } catch {
      return;
    }

    await this.scheduler.handleHumanInputReceived(event);
  };

  private onToolConfirmResponse = async (event: AgentEvent): Promise<void> => {
    if (this.scheduler.hasRun(event.runId)) return;

    try {
      await this.recover(event.runId);
    } catch {
      return;
    }

    await this.scheduler.handleToolConfirmResponse(event);
  };

  get eventBus(): EventBus {
    return this.scheduler.eventBus;
  }

  get checkpointer(): Checkpointer {
    return this.scheduler.checkpointer;
  }

  get graphRegistry(): GraphRegistry {
    return this.scheduler.graphRegistry;
  }

  get nodeRegistry(): NodeRegistry {
    return this.scheduler.nodeRegistry;
  }

  get executorPool(): ExecutorPool {
    return this.scheduler.executorPool;
  }

  get baseScheduler(): Scheduler {
    return this.scheduler;
  }

  get resolver(): RuntimeResolutionService {
    return this.runtimeResolver;
  }
}
