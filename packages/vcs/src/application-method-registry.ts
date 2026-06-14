import type { ApplicationMethod } from "./application-method.js";

/**
 * Registry for application methods keyed by entityType.
 */
export class ApplicationMethodRegistry {
  private readonly methods = new Map<string, ApplicationMethod>();

  /**
   * Register an application method for the given entityType.
   */
  register(entityType: string, method: ApplicationMethod): void {
    this.methods.set(entityType, method);
  }

  /**
   * Get the application method for the given entityType, throws if not found.
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
   * Check whether an application method is registered for the given entityType.
   */
  has(entityType: string): boolean {
    return this.methods.has(entityType);
  }
}
