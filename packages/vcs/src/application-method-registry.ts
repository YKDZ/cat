import type { ApplicationMethod } from "./application-method.js";

/**
 * @zh 变更应用方法注册中心。根据 entityType 查找对应的应用方法。
 * @en Registry for application methods keyed by entityType.
 */
export class ApplicationMethodRegistry {
  private readonly methods = new Map<string, ApplicationMethod>();

  /**
   * @zh 注册一个 entityType 的应用方法。
   * @en Register an application method for the given entityType.
   */
  register(entityType: string, method: ApplicationMethod): void {
    this.methods.set(entityType, method);
  }

  /**
   * @zh 查找 entityType 对应的应用方法，找不到时抛出异常。
   * @en Get the application method for the given entityType, throws if not found.
   */
  get(entityType: string): ApplicationMethod {
    const method = this.methods.get(entityType);
    if (!method) {
      throw new Error(
        `No application method registered for entityType: ${entityType}`,
      );
    }
    return method;
  }

  /**
   * @zh 判断 entityType 是否已注册。
   * @en Check whether an application method is registered for the given entityType.
   */
  has(entityType: string): boolean {
    return this.methods.has(entityType);
  }
}
