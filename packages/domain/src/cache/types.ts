/**
 * 缓存配置选项
 */
export type CacheOptions = {
  /**
   * 是否启用缓存
   */
  enabled: boolean;
  /**
   * 缓存键的生成策略
   * - 'input-hash': 基于输入数据的哈希（默认）
   * - 'custom': 使用自定义函数生成
   */
  keyStrategy?: "input-hash" | "custom";
  /**
   * 自定义缓存键生成函数
   * 当 keyStrategy 为 'custom' 时使用
   */
  generateKey?: (payload: unknown) => string;
  /**
   * 缓存过期时间（秒）
   * 不设置则永不过期
   */
  ttl?: number;
};

/**
 * 缓存存储接口
 */
export interface CacheStore {
  /**
   * 从缓存中获取数据
   */
  get<T>(key: string): Promise<T | null>;
  /**
   * 将数据存入缓存
   */
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  /**
   * 从缓存中删除数据
   */
  delete(key: string): Promise<void>;
  /**
   * 检查缓存是否存在
   */
  has(key: string): Promise<boolean>;
}

/**
 * 会话存储接口（基于 Hash 结构）
 */
export interface SessionStore {
  /** 创建会话并设置 TTL */
  create(
    key: string,
    fields: Record<string, string | number>,
    ttlSeconds: number,
  ): Promise<void>;
  /** 读取单个字段 */
  getField(key: string, field: string): Promise<string | null>;
  /** 读取全部字段 */
  getAll(key: string): Promise<Record<string, string> | null>;
  /** 销毁会话 */
  destroy(key: string): Promise<void>;
}
