import { Membrane } from "./membrane.ts";
import { logger } from "@cat/shared/utils";

export const UNWRAP = Symbol.for("sce.unwrap");

export function unwrap(value: unknown): unknown {
  if (value && (typeof value === "object" || typeof value === "function")) {
    // oxlint-disable-next-line no-unsafe-type-assertion
    const unwrapped = (value as Record<symbol, unknown>)[UNWRAP];
    return unwrapped !== undefined ? unwrapped : value;
  }
  return value;
}

export class BlueToRedHandler implements ProxyHandler<object> {
  constructor(
    private membrane: Membrane,
    private originalTarget: object,
  ) {}

  // 沿原型链查找 Distortion
  private getDistortion(target: object) {
    let current: object | null = target;
    while (current) {
      const dist = this.membrane.distortions.get(current);
      if (dist) return dist;
      current = Object.getPrototypeOf(current);
    }
    return undefined;
  }

  get(target: object, key: string | symbol, receiver: unknown): unknown {
    if (key === UNWRAP) return this.originalTarget;
    if (key === Symbol.unscopables) return undefined;

    // 查找畸变
    const distortion = this.getDistortion(target);
    if (distortion && distortion.get) {
      const distortedGetter = distortion.get(target, key);
      if (distortedGetter) {
        logger.debug("WEB", { msg: `Distortion hit for key: ${String(key)}` });

        const result = distortedGetter(target, receiver);
        return this.membrane.convertBlueToRed(result);
      }
    }

    // receiver 必须是 object 才能传递给 Reflect.get，unwrap 可能返回非 object，但在 get 上下文中 receiver 通常是 Proxy
    // oxlint-disable-next-line no-unsafe-type-assertion
    const originalValue = Reflect.get(target, key, unwrap(receiver) as object);

    return this.membrane.convertBlueToRed(originalValue);
  }

  set(
    target: object,
    key: string | symbol,
    value: unknown,
    receiver: unknown,
  ): boolean {
    const distortion = this.getDistortion(target);
    if (distortion && distortion.set) {
      const allowed = distortion.set(target, key, value);
      if (!allowed) {
        logger.warn("WEB", {
          msg: `Distortion blocked set for key: ${String(key)}`,
        });
        return false;
      }
    }

    const blueValue = this.membrane.convertRedToBlue(value);
    // oxlint-disable-next-line no-unsafe-type-assertion
    return Reflect.set(target, key, blueValue, unwrap(receiver) as object);
  }

  apply(target: object, thisArg: unknown, argArray: unknown[]): unknown {
    // 1. 先进行解包和参数转换 (Red -> Blue)
    const blueThis = unwrap(thisArg);
    const blueArgs = argArray.map((arg) => this.membrane.convertRedToBlue(arg));

    // 检查是否存在 apply 类型的 Distortion
    const distortion = this.getDistortion(target);
    if (distortion && distortion.apply) {
      try {
        // 执行畸变逻辑
        const result = distortion.apply(target, blueThis, blueArgs);
        // 别忘了把结果转回 Red (Blue -> Red)
        return this.membrane.convertBlueToRed(result);
      } catch (err) {
        logger.error("WEB", { msg: `Distortion apply error` }, err);
        throw err;
      }
    }

    // 如果没有畸变，执行默认行为
    // oxlint-disable-next-line no-unsafe-function-type no-unsafe-type-assertion
    const result = Reflect.apply(target as Function, blueThis, blueArgs);
    return this.membrane.convertBlueToRed(result);
  }

  construct(target: object, argArray: unknown[], newTarget: unknown): object {
    const blueArgs = argArray.map((arg) => this.membrane.convertRedToBlue(arg));
    const blueNewTarget = unwrap(newTarget);

    // 构造函数必须返回对象。
    const result = Reflect.construct(
      // oxlint-disable-next-line no-unsafe-function-type no-unsafe-type-assertion
      target as Function,
      blueArgs,
      // oxlint-disable-next-line no-unsafe-function-type no-unsafe-type-assertion
      blueNewTarget as Function,
    );

    // oxlint-disable-next-line no-unsafe-type-assertion
    return this.membrane.convertBlueToRed(result) as object;
  }
}

export class RedToBlueHandler implements ProxyHandler<object> {
  constructor(private membrane: Membrane) {}

  get(target: object, key: string | symbol, receiver: unknown): unknown {
    if (key === UNWRAP) return target;
    // oxlint-disable-next-line no-unsafe-type-assertion
    const value = Reflect.get(target, key, unwrap(receiver) as object);
    return this.membrane.convertRedToBlue(value);
  }

  set(
    target: object,
    key: string | symbol,
    value: unknown,
    receiver: unknown,
  ): boolean {
    const redValue = this.membrane.convertBlueToRed(value);
    // oxlint-disable-next-line no-unsafe-type-assertion
    return Reflect.set(target, key, redValue, unwrap(receiver) as object);
  }

  apply(target: object, thisArg: unknown, argArray: unknown[]): unknown {
    const redThis = this.membrane.convertBlueToRed(thisArg);
    const redArgs = argArray.map((arg) => this.membrane.convertBlueToRed(arg));
    // oxlint-disable-next-line no-unsafe-function-type no-unsafe-type-assertion
    const result = Reflect.apply(target as Function, redThis, redArgs);
    return this.membrane.convertRedToBlue(result);
  }

  construct(target: object, argArray: unknown[], newTarget: unknown): object {
    const redArgs = argArray.map((arg) => this.membrane.convertBlueToRed(arg));
    const redNewTarget = unwrap(newTarget);
    const result = Reflect.construct(
      // oxlint-disable-next-line no-unsafe-function-type no-unsafe-type-assertion
      target as Function,
      redArgs,
      // oxlint-disable-next-line no-unsafe-function-type no-unsafe-type-assertion
      redNewTarget as Function,
    );

    // oxlint-disable-next-line no-unsafe-type-assertion
    return this.membrane.convertRedToBlue(result) as object;
  }
}

export class SandboxGlobalHandler extends BlueToRedHandler {
  // Global 对象的 has 陷阱通常总是返回 true，以支持 with(scope)
  has(_target: object, _key: string | symbol): boolean {
    return true;
  }

  override get(
    target: object,
    key: string | symbol,
    receiver: unknown,
  ): unknown {
    // oxlint-disable-next-line no-unsafe-type-assertion
    const value = Reflect.get(target, key, receiver as object);
    if (value === undefined && !(key in target)) {
      // 特定于全局对象的 fallback 逻辑
    }
    return super.get(target, key, receiver);
  }
}
