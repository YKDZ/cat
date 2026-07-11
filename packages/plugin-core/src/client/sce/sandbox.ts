import * as Vue from "vue";

import {
  createDocumentDistortion,
  createElementDistortion,
  createFetchDistortion,
  createNodeDistortion,
  createPrototypeDistortion,
  createVueDistortion,
} from "#/client/sce/distortions.ts";
import { SandboxGlobalHandler } from "#/client/sce/handlers.ts";
import { Membrane } from "#/client/sce/membrane.ts";
import { basicSandboxGlobal } from "#/client/sce/safe-objects.ts";
import type { BrowserWindow, Distortion } from "#/client/sce/types.ts";

export type DistortionSetup = (
  membrane: Membrane,
  pluginId: string,
  win: BrowserWindow,
) => void;

export type GlobalContextBuilder = (
  pluginId: string,
  win: BrowserWindow,
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
    ...(nodeDistortion.get === undefined ? {} : { get: nodeDistortion.get }),
    ...(elementDistortion.set === undefined
      ? {}
      : { set: elementDistortion.set }),
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
  win: BrowserWindow,
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
