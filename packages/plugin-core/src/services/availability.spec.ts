import { describe, expect, it } from "vitest";

import {
  PluginServiceUnavailableError,
  hasAvailabilityProbe,
  type IPluginService,
  type PluginServiceAvailabilityProbe,
} from "./service";

const basicService: IPluginService = {
  getId: () => "basic",
  getType: () => "LLM_PROVIDER",
};

const availableService: IPluginService & PluginServiceAvailabilityProbe = {
  getId: () => "available",
  getType: () => "TEXT_VECTORIZER",
  getAvailability: () => ({
    available: false,
    reason: "missing-config",
    message: "Service configuration is incomplete.",
  }),
};

describe("service availability helpers", () => {
  it("detects services that implement the availability probe", () => {
    expect(hasAvailabilityProbe(basicService)).toBe(false);
    expect(hasAvailabilityProbe(availableService)).toBe(true);
  });

  it("preserves availability metadata in PluginServiceUnavailableError", () => {
    const error = new PluginServiceUnavailableError({
      available: false,
      reason: "remote-unreachable",
      message: "Service endpoint cannot be reached.",
    });

    expect(error.message).toBe("Service endpoint cannot be reached.");
    expect(error.availability).toEqual({
      available: false,
      reason: "remote-unreachable",
      message: "Service endpoint cannot be reached.",
    });
  });
});
