import {
  type PluginServiceType,
  ServiceImplementationReferenceSchema,
} from "@cat/shared";
import { describe, expect, it } from "vitest";

import { PluginManager } from "#/registry/plugin-manager.ts";
import {
  createServiceImplementationReference,
  resolveRegisteredServiceImplementationReference,
  type ServiceImplementationReference,
} from "#/registry/service-implementation-reference.ts";
import type { RegisteredService } from "#/registry/service-registry.ts";
import { ServiceRegistry } from "#/registry/service-registry.ts";

const reference = (
  serviceType: PluginServiceType = "TEXT_VECTORIZER",
): ServiceImplementationReference =>
  ServiceImplementationReferenceSchema.parse({
    pluginId: "vectors",
    serviceId: "primary",
    serviceType,
    scopeType: "GLOBAL",
    scopeId: "",
  });

const service = (
  partial: Partial<RegisteredService> = {},
): RegisteredService => ({
  pluginId: "vectors",
  id: "primary",
  type: "TEXT_VECTORIZER",
  dbId: 1,
  scopeType: "GLOBAL",
  scopeId: "",
  service: {
    getId: () => "primary",
    getType: () => "TEXT_VECTORIZER",
  },
  ...partial,
});

describe("resolveServiceImplementationReference", () => {
  it("creates a database-independent reference from the logical service identity", () => {
    expect(
      createServiceImplementationReference(
        service({
          dbId: 99,
          scopeType: "PROJECT",
          scopeId: "project-1",
        }),
      ),
    ).toEqual({
      pluginId: "vectors",
      serviceId: "primary",
      serviceType: "TEXT_VECTORIZER",
      scopeType: "PROJECT",
      scopeId: "project-1",
    });
  });

  it("keeps package loading diagnostics on the PluginManager public interface", () => {
    const manager = new PluginManager(
      "GLOBAL",
      "",
      undefined,
      undefined,
      new ServiceRegistry(),
    );

    expect(
      manager.resolveServiceImplementationReference(
        reference(),
        "TEXT_VECTORIZER",
      ),
    ).toEqual({
      kind: "PACKAGE_NOT_LOADED",
      reference: reference(),
      expectedServiceType: "TEXT_VECTORIZER",
    });
  });

  it("reports an installation scope mismatch before package loading", () => {
    const manager = new PluginManager(
      "PROJECT",
      "project-1",
      undefined,
      undefined,
      new ServiceRegistry(),
    );

    expect(
      manager.resolveServiceImplementationReference(
        reference(),
        "TEXT_VECTORIZER",
      ),
    ).toEqual({
      kind: "INSTALLATION_SCOPE_MISMATCH",
      reference: reference(),
      installationScope: { scopeType: "PROJECT", scopeId: "project-1" },
    });
  });

  it("prioritizes scope when scope, type, and package loading all mismatch", () => {
    const manager = new PluginManager(
      "PROJECT",
      "project-1",
      undefined,
      undefined,
      new ServiceRegistry(),
    );

    expect(
      manager.resolveServiceImplementationReference(
        reference("VECTOR_STORAGE"),
        "TEXT_VECTORIZER",
      ),
    ).toEqual({
      kind: "INSTALLATION_SCOPE_MISMATCH",
      reference: reference("VECTOR_STORAGE"),
      installationScope: { scopeType: "PROJECT", scopeId: "project-1" },
    });
  });

  it("reports a service type mismatch before package loading", () => {
    const manager = new PluginManager(
      "GLOBAL",
      "",
      undefined,
      undefined,
      new ServiceRegistry(),
    );

    expect(
      manager.resolveServiceImplementationReference(
        reference("VECTOR_STORAGE"),
        "TEXT_VECTORIZER",
      ),
    ).toEqual({
      kind: "SERVICE_TYPE_MISMATCH",
      reference: reference("VECTOR_STORAGE"),
      expectedServiceType: "TEXT_VECTORIZER",
      actualServiceType: "VECTOR_STORAGE",
    });
  });

  it("resolves only the referenced implementation regardless of registration order", () => {
    const registry = new ServiceRegistry([
      service({ pluginId: "other", id: "other", dbId: 2 }),
      service(),
    ]);

    const result = resolveRegisteredServiceImplementationReference(
      registry,
      { scopeType: "GLOBAL", scopeId: "" },
      reference(),
      "TEXT_VECTORIZER",
    );

    expect(result).toMatchObject({
      kind: "RESOLVED",
      service: { pluginId: "vectors", id: "primary" },
    });
  });

  it("resolves a persisted logical reference after a service database id changes", () => {
    const persisted = createServiceImplementationReference(
      service({ dbId: 1 }),
    );
    const replacement = service({ dbId: 42 });

    const result = resolveRegisteredServiceImplementationReference(
      new ServiceRegistry([replacement]),
      { scopeType: "GLOBAL", scopeId: "" },
      persisted,
      "TEXT_VECTORIZER",
    );

    expect(result).toMatchObject({
      kind: "RESOLVED",
      service: { dbId: 42, pluginId: "vectors", id: "primary" },
    });
  });

  it("reports a missing implementation without selecting another registered service", () => {
    const result = resolveRegisteredServiceImplementationReference(
      new ServiceRegistry([service({ id: "other" })]),
      { scopeType: "GLOBAL", scopeId: "" },
      reference(),
      "TEXT_VECTORIZER",
    );

    expect(result).toEqual({
      kind: "MISSING_IMPLEMENTATION",
      reference: reference(),
      expectedServiceType: "TEXT_VECTORIZER",
    });
  });

  it("reports a service type mismatch", () => {
    const result = resolveRegisteredServiceImplementationReference(
      new ServiceRegistry([service({ type: "VECTOR_STORAGE" })]),
      { scopeType: "GLOBAL", scopeId: "" },
      reference("VECTOR_STORAGE"),
      "TEXT_VECTORIZER",
    );

    expect(result).toEqual({
      kind: "SERVICE_TYPE_MISMATCH",
      reference: reference("VECTOR_STORAGE"),
      expectedServiceType: "TEXT_VECTORIZER",
      actualServiceType: "VECTOR_STORAGE",
    });
  });

  it("rejects references installed in another scope", () => {
    const result = resolveRegisteredServiceImplementationReference(
      new ServiceRegistry([service()]),
      { scopeType: "PROJECT", scopeId: "project-1" },
      reference(),
      "TEXT_VECTORIZER",
    );

    expect(result).toEqual({
      kind: "INSTALLATION_SCOPE_MISMATCH",
      reference: reference(),
      installationScope: { scopeType: "PROJECT", scopeId: "project-1" },
    });
  });

  it("reports duplicate logical identities", () => {
    const result = resolveRegisteredServiceImplementationReference(
      new ServiceRegistry([service(), service({ dbId: 2 })]),
      { scopeType: "GLOBAL", scopeId: "" },
      reference(),
      "TEXT_VECTORIZER",
    );

    expect(result).toEqual({
      kind: "DUPLICATE_IMPLEMENTATION",
      reference: reference(),
      expectedServiceType: "TEXT_VECTORIZER",
      matches: expect.arrayContaining([
        expect.objectContaining({ pluginId: "vectors", id: "primary" }),
      ]),
    });
  });
});
