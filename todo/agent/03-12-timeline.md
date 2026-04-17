### 3.12 时间线与回溯系统

```mermaid
graph TB
    subgraph Session["AgentSession Timeline (DAG Node 级)"]
        subgraph Run1["Run #1 (completed)"]
            P0["precheck_0"]
            R0["reasoning_0<br/>(prompt + LLM call)"]
            T0["tool_0<br/>(translate_segment)"]
            D0["decision_0<br/>(continue)"]
            P1["precheck_1"]
            R1["reasoning_1<br/>(prompt + LLM call)"]
            T1["tool_1<br/>(finish)"]
            D1["decision_1<br/>(finish → acceptance → end)"]
        end

        subgraph Run2["Run #2 (current, fork from R1)"]
            R1_replay["replay_0..4<br/>(确定性重放)"]
            R1_new["reasoning_0<br/>(新 LLM 调用)"]
            Cursor["当前位置 ←"]
        end
    end

    Rollback["回溯操作:<br/>fork(runId, nodeId)<br/>→ replay [0..nodeId) + retry 从 nodeId 开始"]

    Session --> Rollback
```

**基于 Patch 的变更管理** (利用现有 graph 包的 `Patch` 类型):

```typescript
interface Patch {
  metadata: {
    patchId: string;
    parentSnapshotVersion: number;
    actorId: string;
    timestamp: Date;
    nodeId: string;
    nodeType: string; // reasoning | tool | decision | precheck
  };
  updates: Record<string, unknown>;
}
```

每个 DAG 节点执行产生的黑板变更封装为 Patch。回溯 = 选择一个节点并从该点分叉。DAG 模型使回溯粒度从"Run 级"细化到"节点级"。

