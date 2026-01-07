import { Membrane } from "./membrane.ts";
import {
  createDocumentDistortion,
  createElementDistortion,
  createFetchDistortion,
  createNodeDistortion,
  createPrototypeDistortion,
  createVueDistortion,
} from "./distortions.ts";
import { SandboxGlobalHandler } from "./handlers.ts";
import { Distortion } from "./types.ts";
import { basicSandboxGlobal } from "./safe-objects.ts";
import * as Vue from "vue";

export type DistortionSetup = (
  membrane: Membrane,
  pluginId: string,
  win: Window,
) => void;

export type GlobalContextBuilder = (
  pluginId: string,
  win: Window,
) => Record<string, unknown>;

export interface SandboxOptions {
  distortionSetup?: DistortionSetup;
  globalContextBuilder: GlobalContextBuilder;
}

export const setupDefaultDistortions: DistortionSetup = (
  membrane,
  pluginId,
  win,
) => {
  membrane.distortions.set(
    win.document,
    createDocumentDistortion(pluginId, win),
  );
  membrane.distortions.set(Vue, createVueDistortion());
  // oxlint-disable-next-line unbound-method
  membrane.distortions.set(win.fetch, createFetchDistortion(pluginId, win));

  const nodeDistortion = createNodeDistortion(win);
  const elementDistortion = createElementDistortion(win);

  const compositeDistortion: Distortion = {
    get: nodeDistortion.get,
    set: elementDistortion.set,
  };

  membrane.distortions.set(win.Node.prototype, nodeDistortion);
  membrane.distortions.set(win.Element.prototype, compositeDistortion);
  membrane.distortions.set(win.HTMLElement.prototype, compositeDistortion);

  const protoDistortion = createPrototypeDistortion(win);
  membrane.distortions.set(win.Object.prototype, protoDistortion);
  membrane.distortions.set(win.Array.prototype, protoDistortion);
};

export function createSandbox(
  pluginId: string,
  win: Window,
  options: SandboxOptions,
): {
  evaluate: (code: string) => void;
} {
  const { distortionSetup = setupDefaultDistortions } = options;

  const membrane = new Membrane({
    pluginId,
    distortions: new Map(),
  });

  distortionSetup(membrane, pluginId, win);

  const builtSandboxGlobal = options.globalContextBuilder(pluginId, win);
  const rawSandboxGlobal = {
    ...basicSandboxGlobal(win),
    ...builtSandboxGlobal,
  };

  const globalHandler = new SandboxGlobalHandler(membrane, rawSandboxGlobal);
  const redGlobal = new Proxy(rawSandboxGlobal, globalHandler);

  return {
    evaluate: (code: string): void => {
      // oxlint-disable-next-line no-implied-eval
      const safeExecutor = new Function(
        "sandbox",
        `with(sandbox) { 
          (function() { 
            "use strict";
            ${code}
          })(); 
        }`,
      );
      // oxlint-disable-next-line no-unsafe-call
      safeExecutor(redGlobal);
    },
  };
}
