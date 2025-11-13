import { FlowProducer } from "bullmq";
import type { QueueOptions, FlowJob, JobsOptions } from "bullmq";
import type { ZodType } from "zod/v4";

/**
 * 工作流节点
 */
export interface FlowNode<TData = unknown> {
  name: string;
  workerId: string;
  data: TData;
  children?: FlowNode[];
  opts?: JobsOptions;
}

/**
 * 工作流
 */
export interface FlowDefinition<TInput = unknown> {
  id: string;
  name: string;
  inputSchema: ZodType<TInput>;
  build: (input: TInput) => FlowNode | Promise<FlowNode>;
}

/**
 * 工作流编排器
 */
export class FlowOrchestrator {
  private flowProducer: FlowProducer;

  constructor(queueConfig: QueueOptions) {
    this.flowProducer = new FlowProducer({
      connection: queueConfig.connection,
    });
  }

  /**
   * 执行工作流
   *
   * @returns 返回根 Job，可用于追踪状态和获取结果
   */
  async execute<TInput>(
    flow: FlowDefinition<TInput>,
    input: TInput,
    rootJobOptions?: JobsOptions,
  ): Promise<{
    rootJob: unknown;
    tree: unknown;
  }> {
    // 验证输入
    const validatedInput = flow.inputSchema.parse(input);

    // 构建工作流树
    let rootNode = await flow.build(validatedInput);

    if (rootJobOptions) {
      rootNode = {
        ...rootNode,
        name: rootJobOptions.jobId ?? rootNode.name,
        opts: {
          ...rootNode.opts,
          ...rootJobOptions,
        },
      };
    }

    // 转换为 BullMQ FlowJob 格式
    const flowJob = this.convertToFlowJob(rootNode);

    // 添加到 BullMQ (原子操作)
    const tree = await this.flowProducer.add(flowJob);

    return {
      rootJob: tree.job,
      tree,
    };
  }

  /**
   * 批量执行多个工作流
   */
  async executeBulk<TInput>(
    flow: FlowDefinition<TInput>,
    inputs: TInput[],
  ): Promise<unknown[]> {
    // 验证所有输入
    const validatedInputs = inputs.map((input) =>
      flow.inputSchema.parse(input),
    );

    // 构建所有工作流树
    const rootNodes = await Promise.all(
      validatedInputs.map(async (input) => flow.build(input)),
    );

    // 转换为 FlowJobs
    const flowJobs = rootNodes.map((rootNode) =>
      this.convertToFlowJob(rootNode),
    );

    // 批量添加
    const trees = await this.flowProducer.addBulk(flowJobs);

    return trees;
  }

  /**
   * 转换为 BullMQ FlowJob 格式
   */
  private convertToFlowJob(node: FlowNode): FlowJob {
    return {
      name: node.name,
      queueName: node.workerId,
      data: node.data,
      opts: node.opts,
      children: node.children?.map((child) => this.convertToFlowJob(child)),
    };
  }

  /**
   * 关闭 FlowProducer
   */
  async close(): Promise<void> {
    await this.flowProducer.close();
  }
}
