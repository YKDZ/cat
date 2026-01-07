import { BlueToRedHandler, RedToBlueHandler, unwrap } from "./handlers.ts";
import { MembraneOptions, Distortion } from "./types.ts";

export class Membrane {
  // Host -> Proxy
  private blueToRedMap = new WeakMap<object, object>();
  // Sandbox -> Proxy
  private redToBlueMap = new WeakMap<object, object>();

  // Tracking sets
  private redProxies = new WeakSet<object>();
  private blueProxies = new WeakSet<object>();

  public distortions: Map<object, Distortion>;
  public pluginId: string;

  constructor(options: MembraneOptions) {
    this.distortions = options.distortions || new Map();
    this.pluginId = options.pluginId;
  }

  /**
   * 将宿主对象转换为沙箱代理 (Blue -> Red)
   */
  public convertBlueToRed(blueValue: unknown): unknown {
    // 基础类型直接返回
    if (
      blueValue === null ||
      (typeof blueValue !== "object" && typeof blueValue !== "function")
    ) {
      return blueValue;
    }

    if (this.blueProxies.has(blueValue)) {
      return unwrap(blueValue);
    }

    if (this.blueToRedMap.has(blueValue)) {
      return this.blueToRedMap.get(blueValue);
    }

    const handler = new BlueToRedHandler(this, blueValue);
    const redProxy = new Proxy(blueValue, handler);

    // oxlint-disable-next-line no-unsafe-argument
    this.blueToRedMap.set(blueValue, redProxy);
    // oxlint-disable-next-line no-unsafe-argument
    this.redProxies.add(redProxy);

    return redProxy;
  }

  /**
   * 将沙箱对象转换为宿主代理 (Red -> Blue)
   */
  public convertRedToBlue(redValue: unknown): unknown {
    if (
      redValue === null ||
      (typeof redValue !== "object" && typeof redValue !== "function")
    ) {
      return redValue;
    }

    if (this.redProxies.has(redValue)) {
      return unwrap(redValue);
    }

    if (this.redToBlueMap.has(redValue)) {
      return this.redToBlueMap.get(redValue);
    }

    const handler = new RedToBlueHandler(this);
    const blueProxy = new Proxy(redValue, handler);

    // oxlint-disable-next-line no-unsafe-argument
    this.redToBlueMap.set(redValue, blueProxy);
    // oxlint-disable-next-line no-unsafe-argument
    this.blueProxies.add(blueProxy);

    return blueProxy;
  }

  public unwrap(proxy: unknown): unknown {
    return unwrap(proxy);
  }
}
