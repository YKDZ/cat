// oxlint-disable no-unsafe-argument no-explicit-any explicit-module-boundary-types no-unsafe-return

export type DistortionHandler = (target: any, receiver: any) => any;
export type DistortionSetter = (
  target: any,
  value: any,
  receiver: any,
) => boolean;

export interface Distortion {
  get?: (
    originalTarget: any,
    key: string | symbol,
  ) => DistortionHandler | undefined;
  set?: (originalTarget: any, key: string | symbol, value: any) => boolean;
  /**
   * 函数调用拦截
   * @param target 原始目标函数
   * @param thisArg 已解包的 this (Blue)
   * @param argArray 已解包的参数数组 (Blue)
   */
  apply?: (target: any, thisArg: any, argArray: any[]) => any;
  /**
   * 构造函数拦截
   */
  construct?: (target: any, argArray: any[], newTarget: any) => any;
}

export interface MembraneOptions {
  distortions?: Map<any, Distortion>;
  pluginId: string;
}

export type RealmSide = "blue" | "red";
