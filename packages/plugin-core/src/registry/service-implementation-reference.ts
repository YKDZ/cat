import { ServiceImplementationReferenceSchema } from "@cat/shared";
import type {
  PluginServiceType,
  ScopeType,
  ServiceImplementationReference as SharedServiceImplementationReference,
} from "@cat/shared";

import type { PluginServiceMap } from "#/types/plugin.ts";

import type { RegisteredService, ServiceRegistry } from "./service-registry.ts";

export type ServiceImplementationReference =
  SharedServiceImplementationReference;

type RuntimeScope = {
  scopeType: ScopeType;
  scopeId: string;
};

type ResolvedService<T extends PluginServiceType> = RegisteredService & {
  service: PluginServiceMap[T];
};

export type ServiceImplementationResolution<T extends PluginServiceType> =
  | {
      kind: "RESOLVED";
      reference: ServiceImplementationReference;
      service: ResolvedService<T>;
    }
  | {
      kind: "INSTALLATION_SCOPE_MISMATCH";
      reference: ServiceImplementationReference;
      installationScope: RuntimeScope;
    }
  | {
      kind: "SERVICE_TYPE_MISMATCH";
      reference: ServiceImplementationReference;
      expectedServiceType: T;
      actualServiceType: PluginServiceType;
    }
  | {
      kind: "MISSING_IMPLEMENTATION";
      reference: ServiceImplementationReference;
      expectedServiceType: T;
    }
  | {
      kind: "PACKAGE_NOT_LOADED";
      reference: ServiceImplementationReference;
      expectedServiceType: T;
    }
  | {
      kind: "DUPLICATE_IMPLEMENTATION";
      reference: ServiceImplementationReference;
      expectedServiceType: T;
      matches: readonly ResolvedService<T>[];
    };

const isSameScope = (
  scope: RuntimeScope,
  reference: ServiceImplementationReference,
): boolean =>
  scope.scopeType === reference.scopeType &&
  scope.scopeId === reference.scopeId;

const hasExpectedServiceType = <T extends PluginServiceType>(
  reference: ServiceImplementationReference,
  expectedServiceType: T,
): reference is ServiceImplementationReference & { serviceType: T } =>
  reference.serviceType === expectedServiceType;

type StaticServiceImplementationMismatch<T extends PluginServiceType> = Extract<
  ServiceImplementationResolution<T>,
  { kind: "INSTALLATION_SCOPE_MISMATCH" | "SERVICE_TYPE_MISMATCH" }
>;

export const validateServiceImplementationReference = <
  T extends PluginServiceType,
>(
  scope: RuntimeScope,
  reference: ServiceImplementationReference,
  expectedServiceType: T,
): StaticServiceImplementationMismatch<T> | null => {
  if (!isSameScope(scope, reference)) {
    return {
      kind: "INSTALLATION_SCOPE_MISMATCH",
      reference,
      installationScope: scope,
    };
  }
  if (!hasExpectedServiceType(reference, expectedServiceType)) {
    return {
      kind: "SERVICE_TYPE_MISMATCH",
      reference,
      expectedServiceType,
      actualServiceType: reference.serviceType,
    };
  }
  return null;
};

export const createServiceImplementationReference = (
  service: Pick<
    RegisteredService,
    "pluginId" | "id" | "type" | "scopeType" | "scopeId"
  >,
): ServiceImplementationReference =>
  ServiceImplementationReferenceSchema.parse({
    pluginId: service.pluginId,
    serviceId: service.id,
    serviceType: service.type,
    scopeType: service.scopeType,
    scopeId: service.scopeId,
  });

/**
 * Resolve one explicitly persisted service identity. This function never
 * chooses another implementation when the reference cannot be satisfied.
 */
export const resolveRegisteredServiceImplementationReference = <
  T extends PluginServiceType,
>(
  registry: ServiceRegistry,
  scope: RuntimeScope,
  reference: ServiceImplementationReference,
  expectedServiceType: T,
): ServiceImplementationResolution<T> => {
  const mismatch = validateServiceImplementationReference(
    scope,
    reference,
    expectedServiceType,
  );
  if (mismatch !== null) return mismatch;

  const identityMatches = registry
    .getAll()
    .filter(
      (service) =>
        service.pluginId === reference.pluginId &&
        service.id === reference.serviceId,
    );

  if (identityMatches.length === 0) {
    return { kind: "MISSING_IMPLEMENTATION", reference, expectedServiceType };
  }

  const matchingServices = identityMatches.filter(
    (service) => service.type === expectedServiceType,
  );
  if (matchingServices.length === 0) {
    return {
      kind: "SERVICE_TYPE_MISMATCH",
      reference,
      expectedServiceType,
      actualServiceType: identityMatches[0]?.type ?? reference.serviceType,
    };
  }

  if (matchingServices.length > 1) {
    return {
      kind: "DUPLICATE_IMPLEMENTATION",
      reference,
      expectedServiceType,
      matches: matchingServices as ResolvedService<T>[],
    };
  }

  const service = matchingServices[0];
  if (!service) {
    return { kind: "MISSING_IMPLEMENTATION", reference, expectedServiceType };
  }

  return {
    kind: "RESOLVED",
    reference,
    service: service as ResolvedService<T>,
  };
};
