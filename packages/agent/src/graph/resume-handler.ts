import type { Checkpointer } from "@/graph/checkpointer";
import type { AgentEventBus } from "@/graph/event-bus";
import type { AgentEvent } from "@/graph/events";
import type { Scheduler } from "@/graph/scheduler";

import { createAgentEvent } from "@/graph/events";

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = item;
    }
    return out;
  }
  return {};
};

/**
 * ResumeHandler
 *
 * 通过事件触发恢复暂停的 run：
 * - human:input:received
 * - tool:confirm:response
 */
export class ResumeHandler {
  private readonly unsubscribeFns: Array<() => void> = [];

  constructor(
    private readonly eventBus: AgentEventBus,
    private readonly _checkpointer: Checkpointer,
    private readonly scheduler: Scheduler,
  ) {
    this.setupHandlers();
  }

  private setupHandlers = (): void => {
    this.unsubscribeFns.push(
      this.eventBus.subscribe("human:input:received", this.onHumanInput),
    );
    this.unsubscribeFns.push(
      this.eventBus.subscribe("tool:confirm:response", this.onToolConfirm),
    );
  };

  dispose = (): void => {
    for (const unsubscribe of this.unsubscribeFns) {
      unsubscribe();
    }
    this.unsubscribeFns.length = 0;
  };

  private onHumanInput = async (event: AgentEvent): Promise<void> => {
    await this.recoverAndResume(event);
  };

  private onToolConfirm = async (event: AgentEvent): Promise<void> => {
    await this.recoverAndResume(event);
  };

  private recoverAndResume = async (event: AgentEvent): Promise<void> => {
    try {
      await this.scheduler.recover(event.runId);
    } catch {
      // 可能本就在内存激活态，继续尝试 resume
    }

    try {
      await this.scheduler.resume(event.runId);
      return;
    } catch {
      // 可能并非 paused（已 running/completed），忽略
    }

    const payload = asRecord(event.payload);
    const nodeId = payload["nodeId"];
    if (typeof nodeId === "string" && nodeId.length > 0) {
      await this.eventBus.publish(
        createAgentEvent({
          runId: event.runId,
          nodeId,
          type: "run:resume",
          timestamp: new Date().toISOString(),
          payload: { source: "resume-handler" },
        }),
      );
    }
  };
}
