import * as z from "zod";

import { PluginServiceTypeSchema } from "#/schema/enum.ts";
import {
  PluginIdentifierSchema,
  ScopedInstallationIdentifierSchema,
  ServiceIdentifierSchema,
} from "#/schema/plugin-identifier.ts";

/**
 * Stable identity for one service implementation installed in one scope.
 *
 * This intentionally contains no database surrogate key. A package upgrade can
 * replace its database rows while persisted references remain resolvable.
 */
const ServiceIdentitySchema = {
  pluginId: PluginIdentifierSchema,
  serviceId: ServiceIdentifierSchema,
  serviceType: PluginServiceTypeSchema,
};

/**
 * Stable identity for one service implementation installed in one scope.
 *
 * Scope is deliberately discriminated: global references have no scope key,
 * while project and user references must retain one.
 */
export const ServiceImplementationReferenceSchema = z.discriminatedUnion(
  "scopeType",
  [
    z.strictObject({
      ...ServiceIdentitySchema,
      scopeType: z.literal("GLOBAL"),
      scopeId: z.literal(""),
    }),
    z.strictObject({
      ...ServiceIdentitySchema,
      scopeType: z.literal("PROJECT"),
      scopeId: ScopedInstallationIdentifierSchema,
    }),
    z.strictObject({
      ...ServiceIdentitySchema,
      scopeType: z.literal("USER"),
      scopeId: ScopedInstallationIdentifierSchema,
    }),
  ],
);

export type ServiceImplementationReference = z.infer<
  typeof ServiceImplementationReferenceSchema
>;

/** Stable UI and transport key for a service implementation reference. */
export const serviceImplementationReferenceKey = (
  reference: ServiceImplementationReference,
): string =>
  JSON.stringify([
    reference.scopeType,
    reference.scopeId,
    reference.pluginId,
    reference.serviceId,
    reference.serviceType,
  ]);
