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
  // 可以扩展 construct, apply 等
}

export interface MembraneOptions {
  distortions?: Map<any, Distortion>;
  pluginId: string;
}

export type RealmSide = "blue" | "red";
