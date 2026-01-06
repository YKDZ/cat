// oxlint-disable no-unsafe-argument no-explicit-any explicit-module-boundary-types no-unsafe-return
import { Membrane } from "./membrane.ts";
import { logger } from "@cat/shared/utils"; // 引入 logger

export const UNWRAP = Symbol.for("sce.unwrap");

// oxlint-disable-next-line no-explicit-any
export function unwrap(value: any): any {
  // oxlint-disable-next-line no-unsafe-member-access
  return (value && value[UNWRAP]) || value;
}

export class BlueToRedHandler implements ProxyHandler<any> {
  constructor(
    private membrane: Membrane,
    private originalTarget: any,
  ) {}

  // 沿原型链查找 Distortion
  private getDistortion(target: any) {
    let current = target;
    while (current) {
      const dist = this.membrane.distortions.get(current);
      if (dist) return dist;
      current = Object.getPrototypeOf(current);
      if (current === null) break;
    }
    return undefined;
  }

  get(target: any, key: string | symbol, receiver: any): any {
    if (key === UNWRAP) return this.originalTarget;
    if (key === Symbol.unscopables) return undefined;

    // 1. 查找畸变
    const distortion = this.getDistortion(target);
    if (distortion && distortion.get) {
      const distortedGetter = distortion.get(target, key);
      if (distortedGetter) {
        // [LOG] 记录畸变命中
        logger.info("WEB", { msg: `Distortion hit for key: ${String(key)}` });

        // [CRITICAL FIX] 必须将畸变函数的返回值进行 convertBlueToRed 包装！
        const result = distortedGetter(target, receiver);
        return this.membrane.convertBlueToRed(result);
      }
    }

    // 2. 获取原始值
    const originalValue = Reflect.get(target, key, unwrap(receiver));

    // 3. 转换 Blue -> Red
    return this.membrane.convertBlueToRed(originalValue);
  }

  // ... (set, apply, construct 保持不变)
  set(target: any, key: string | symbol, value: any, receiver: any): boolean {
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
    return Reflect.set(target, key, blueValue, unwrap(receiver));
  }

  apply(target: any, thisArg: any, argArray: any[]): any {
    const blueThis = unwrap(thisArg);
    // oxlint-disable-next-line no-explicit-any
    const blueArgs = argArray.map((arg: any) =>
      this.membrane.convertRedToBlue(arg),
    );
    const result = Reflect.apply(target, blueThis, blueArgs);
    return this.membrane.convertBlueToRed(result);
  }

  construct(target: any, argArray: any[], newTarget: any): any {
    // oxlint-disable-next-line no-explicit-any
    const blueArgs = argArray.map((arg: any) =>
      this.membrane.convertRedToBlue(arg),
    );
    const blueNewTarget = unwrap(newTarget);
    const result = Reflect.construct(target, blueArgs, blueNewTarget);
    return this.membrane.convertBlueToRed(result);
  }
}

// ... (RedToBlueHandler 和 SandboxGlobalHandler 保持不变)
export class RedToBlueHandler implements ProxyHandler<any> {
  constructor(private membrane: Membrane) {}

  get(target: any, key: string | symbol, receiver: any): any {
    if (key === UNWRAP) return target;
    const value = Reflect.get(target, key, unwrap(receiver));
    return this.membrane.convertRedToBlue(value);
  }

  set(target: any, key: string | symbol, value: any, receiver: any): boolean {
    const redValue = this.membrane.convertBlueToRed(value);
    return Reflect.set(target, key, redValue, unwrap(receiver));
  }

  apply(target: any, thisArg: any, argArray: any[]): any {
    const redThis = this.membrane.convertBlueToRed(thisArg);
    const redArgs = argArray.map((arg: any) =>
      this.membrane.convertBlueToRed(arg),
    );
    const result = Reflect.apply(target, redThis, redArgs);
    return this.membrane.convertRedToBlue(result);
  }

  construct(target: any, argArray: any[], newTarget: any): any {
    const redArgs = argArray.map((arg: any) =>
      this.membrane.convertBlueToRed(arg),
    );
    const redNewTarget = unwrap(newTarget);
    const result = Reflect.construct(target, redArgs, redNewTarget);
    return this.membrane.convertRedToBlue(result);
  }
}

export class SandboxGlobalHandler extends BlueToRedHandler {
  has(_target: any, _key: string | symbol): boolean {
    return true;
  }

  override get(target: any, key: string | symbol, receiver: any): any {
    const value = Reflect.get(target, key, receiver);
    if (value === undefined && !(key in target)) {
      // Fallback logic if needed
    }
    return super.get(target, key, receiver);
  }
}
