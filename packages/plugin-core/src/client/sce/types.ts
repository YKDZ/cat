export interface SandboxGlobal {
  console: Console;
  document: Document;
  localStorage: undefined;
  sessionStorage: undefined;

  window: SandboxGlobal;
  self: SandboxGlobal;
  globalThis: SandboxGlobal;
  parent: SandboxGlobal;
  top: SandboxGlobal;

  [key: string | symbol]: unknown;
}

export type DistortionHandler = (target: object, receiver: unknown) => unknown;

export type DistortionSetter = (
  target: object,
  value: unknown,
  receiver: unknown,
) => boolean;

export interface Distortion {
  // get 陷阱：target 必须是对象
  get?: (
    originalTarget: object,
    key: string | symbol,
  ) => DistortionHandler | undefined;

  // set 陷阱
  set?: (
    originalTarget: object,
    key: string | symbol,
    value: unknown,
  ) => boolean;

  /**
   * 函数调用拦截
   * @param target 原始目标函数 (在 Proxy 陷阱中必须是 object)
   * @param thisArg 已解包的 this (Blue)
   * @param argArray 已解包的参数数组 (Blue)
   */
  apply?: (target: object, thisArg: unknown, argArray: unknown[]) => unknown;

  /**
   * 构造函数拦截
   */
  construct?: (
    target: object,
    argArray: unknown[],
    newTarget: unknown,
  ) => object;
}

export interface MembraneOptions {
  // Map 的 Key 必须是对象引用
  distortions?: Map<object, Distortion>;
  pluginId: string;
}

export type RealmSide = "blue" | "red";
