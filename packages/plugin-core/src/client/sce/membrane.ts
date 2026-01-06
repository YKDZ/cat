// oxlint-disable no-unsafe-argument no-explicit-any explicit-module-boundary-types no-unsafe-return
import { BlueToRedHandler, RedToBlueHandler, unwrap } from "./handlers.ts";
import { MembraneOptions, Distortion } from "./types.ts";

export class Membrane {
  // 映射: 宿主对象 -> 沙箱代理 (Host -> Proxy)
  private blueToRedMap = new WeakMap<object>();
  // 映射: 沙箱对象 -> 宿主代理 (Sandbox -> Proxy)
  private redToBlueMap = new WeakMap<object>();

  // 新增: 追踪集合，用于识别对象是否为本膜创建的 Proxy，以便安全解包
  private redProxies = new WeakSet<object>();
  private blueProxies = new WeakSet<object>();

  public distortions: Map<any, Distortion>;
  public pluginId: string;

  constructor(options: MembraneOptions) {
    this.distortions = options.distortions || new Map();
    this.pluginId = options.pluginId;
  }

  /**
   * 将宿主对象转换为沙箱代理 (Blue -> Red)
   */
  public convertBlueToRed(blueValue: any): any {
    if (
      blueValue === null ||
      (typeof blueValue !== "object" && typeof blueValue !== "function")
    ) {
      return blueValue;
    }

    // 1. [CRITICAL FIX] 检查是否为 RedToBlue Proxy (Blue Proxy)
    // 如果宿主传递进来的本来就是个“从沙箱传出来的 Blue Proxy”，我们需要解包拿到原始的 Red 对象
    // 否则会导致 Proxy(BlueProxy(RedObject)) 的多层嵌套
    if (this.blueProxies.has(blueValue)) {
      return unwrap(blueValue);
    }

    // 2. 检查缓存
    if (this.blueToRedMap.has(blueValue)) {
      return this.blueToRedMap.get(blueValue);
    }

    // 3. 创建代理
    const handler = new BlueToRedHandler(this, blueValue);
    const redProxy = new Proxy(blueValue, handler);

    // 4. 存入映射与追踪集合
    this.blueToRedMap.set(blueValue, redProxy);
    this.redProxies.add(redProxy); // 标记这是一个 Red Proxy

    return redProxy;
  }

  /**
   * 将沙箱对象转换为宿主代理 (Red -> Blue)
   */
  public convertRedToBlue(redValue: any): any {
    if (
      redValue === null ||
      (typeof redValue !== "object" && typeof redValue !== "function")
    ) {
      return redValue;
    }

    // 1. [CRITICAL FIX] 检查是否为 BlueToRed Proxy (Red Proxy)
    // 这是修复 "prototype read-only" 错误的关键。
    // 当插件把 Host Constructor (已被封装为 Red Proxy) 传回给宿主时，这里必须解包。
    // 解包后，宿主拿到的是原始的 Host Constructor，其 prototype 访问完全正常。
    if (this.redProxies.has(redValue)) {
      return unwrap(redValue);
    }

    // 2. 检查缓存
    if (this.redToBlueMap.has(redValue)) {
      return this.redToBlueMap.get(redValue);
    }

    // 3. 创建代理
    const handler = new RedToBlueHandler(this);
    const blueProxy = new Proxy(redValue, handler);

    this.redToBlueMap.set(redValue, blueProxy);
    this.blueProxies.add(blueProxy); // 标记这是一个 Blue Proxy

    return blueProxy;
  }

  // 辅助方法，暴露给外部使用
  public unwrap(proxy: any): any {
    return unwrap(proxy);
  }
}
