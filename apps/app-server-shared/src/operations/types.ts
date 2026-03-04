/**
 * 操作函数的上下文
 * 与 BullMQ 完全解耦，可用于 Agent、API 直接调用等场景
 */
export type OperationContext = {
  /**
   * 追踪 ID，用于日志关联和 Redis pub/sub 通道命名
   * 不提供时由调用方自行生成
   */
  traceId: string;
  /**
   * 取消信号，支持中断长时间运行的操作
   */
  signal?: AbortSignal;
};
