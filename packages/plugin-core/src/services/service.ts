import type { PluginServiceType } from "@cat/shared";

/**
 * Runtime availability summary for a plugin service.
 */
export type PluginServiceAvailability = {
  /** Whether the service is currently available. */
  available: boolean;
  /** Availability reason code. */
  reason:
    | "ok"
    | "missing-config"
    | "disabled-by-runtime"
    | "remote-unreachable";
  /** Optional detail for UI/probe surfaces. */
  message?: string;
};

/**
 * Protocol for plugin services that expose structured availability probing.
 */
export interface PluginServiceAvailabilityProbe {
  /**
   * Return the current availability state of the service.
   *
   * @returns - Structured availability summary
   */
  getAvailability():
    | Promise<PluginServiceAvailability>
    | PluginServiceAvailability;
}

export interface IPluginService {
  getId(): string;
  getType(): PluginServiceType;
}

/**
 * Structured error indicating that a plugin service is currently unavailable.
 */
export class PluginServiceUnavailableError extends Error {
  public constructor(public readonly availability: PluginServiceAvailability) {
    super(availability.message ?? availability.reason);
  }
}

/**
 * Determine whether a plugin service implements the availability probe protocol.
 *
 * @param service - Plugin service to inspect
 * @returns - Whether the service implements the availability probe
 */
export const hasAvailabilityProbe = (
  service: IPluginService,
): service is IPluginService & PluginServiceAvailabilityProbe => {
  return (
    "getAvailability" in service &&
    typeof Reflect.get(service, "getAvailability") === "function"
  );
};
